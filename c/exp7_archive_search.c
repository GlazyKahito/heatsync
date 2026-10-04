/*
 * Experiment 7 : Temperature Archive Search
 *
 * Aim: Demonstrate the use of Sorting in binary searching algorithm.
 *
 * Use-case mapping: HEATSYNC (heatwave response engine for Maharashtra, use
 * case KJS-CES-01) keeps an archive of daily maximum temperatures for every
 * district. Questions such as "on which days did Nagpur reach 44.2 C?" or "how
 * many days this month were at or above 40 C / 45 C?" are asked constantly
 * when verifying warnings and reporting a heat season. Binary search answers
 * them in O(log n) probes, but only on sorted data. This program loads the real
 * 31 daily Tmax values of Nagpur for May 2024 (ERA5 reanalysis), sorts them by
 * Tmax with insertion sort or quick sort (reporting comparisons and swaps so
 * the two can be compared), then runs an exact-match binary search (tolerance
 * 0.05 C, otherwise the insertion position is reported) and a lower-bound
 * binary search that counts days >= X C. A sorted flag makes binary search
 * refuse to run on unsorted data, showing why sorting comes first.
 *
 * Data: Nagpur daily Tmax, 1-31 May 2024, ERA5 reanalysis via Open-Meteo
 *       (CC BY 4.0).
 *
 * Build: gcc -std=c99 -Wall -Wextra -o exp7_archive_search.exe exp7_archive_search.c
 */

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <ctype.h>

#define N         31
#define LINE_LEN  128
#define TOLERANCE 0.05f     /* exact-match tolerance for binary search */
#define EPS       0.005f    /* guards float rounding in >= comparisons */

struct Record {
    int   day;      /* day of May 2024 */
    float tmax;     /* daily maximum temperature, deg C */
};

/* Nagpur, May 2024 (ERA5), in chronological order */
const struct Record original[N] = {
    {1, 41.4f},  {2, 39.7f},  {3, 40.6f},  {4, 41.9f},  {5, 42.7f},
    {6, 41.9f},  {7, 40.0f},  {8, 38.8f},  {9, 37.3f},  {10, 40.4f},
    {11, 41.4f}, {12, 40.3f}, {13, 37.6f}, {14, 39.9f}, {15, 38.6f},
    {16, 36.4f}, {17, 34.4f}, {18, 40.0f}, {19, 40.1f}, {20, 41.1f},
    {21, 42.2f}, {22, 41.7f}, {23, 41.9f}, {24, 43.6f}, {25, 41.8f},
    {26, 45.8f}, {27, 45.5f}, {28, 44.2f}, {29, 43.6f}, {30, 43.7f},
    {31, 44.2f},
};

struct Record work[N];      /* working copy that gets sorted */
int isSorted = 0;           /* 1 only after a sort by tmax */
int inputEnded = 0;

/* ------------------------------------------------------------------ */
/* Input helpers                                                        */
/* ------------------------------------------------------------------ */

int readLine(char *buf, int size)
{
    int len, c;
    if (fgets(buf, size, stdin) == NULL) {
        inputEnded = 1;
        buf[0] = '\0';
        return 0;
    }
    len = (int)strlen(buf);
    if (len > 0 && buf[len - 1] == '\n')
        buf[--len] = '\0';
    else
        while ((c = getchar()) != '\n' && c != EOF)
            ;
    if (len > 0 && buf[len - 1] == '\r')
        buf[--len] = '\0';
#ifdef ECHO_INPUT
    printf("%s\n", buf);
#endif
    return 1;
}

int parseInt(const char *s, int *out)
{
    int i = 0, sign = 1, value = 0, digits = 0;
    while (isspace((unsigned char)s[i])) i++;
    if (s[i] == '+' || s[i] == '-') {
        if (s[i] == '-') sign = -1;
        i++;
    }
    while (isdigit((unsigned char)s[i])) {
        if (value > 10000000) return 0;
        value = value * 10 + (s[i] - '0');
        i++;
        digits++;
    }
    while (isspace((unsigned char)s[i])) i++;
    if (digits == 0 || s[i] != '\0') return 0;
    *out = sign * value;
    return 1;
}

int parseFloat(const char *s, float *out)
{
    int i = 0, digits = 0;
    double sign = 1.0, value = 0.0, scale = 1.0;
    while (isspace((unsigned char)s[i])) i++;
    if (s[i] == '+' || s[i] == '-') {
        if (s[i] == '-') sign = -1.0;
        i++;
    }
    while (isdigit((unsigned char)s[i])) {
        value = value * 10.0 + (s[i] - '0');
        if (value > 1e7) return 0;
        i++;
        digits++;
    }
    if (s[i] == '.') {
        i++;
        while (isdigit((unsigned char)s[i])) {
            scale /= 10.0;
            value += (s[i] - '0') * scale;
            i++;
            digits++;
        }
    }
    while (isspace((unsigned char)s[i])) i++;
    if (digits == 0 || s[i] != '\0') return 0;
    *out = (float)(sign * value);
    return 1;
}

int readInt(const char *prompt, int *out)
{
    char buf[LINE_LEN];
    printf("%s", prompt);
    if (!readLine(buf, LINE_LEN)) return 0;
    if (!parseInt(buf, out)) {
        printf("  Invalid input '%s': a whole number is required.\n", buf);
        return 0;
    }
    return 1;
}

int readTemp(const char *prompt, float *out)
{
    char buf[LINE_LEN];
    printf("%s", prompt);
    if (!readLine(buf, LINE_LEN)) return 0;
    if (!parseFloat(buf, out)) {
        printf("  Invalid input '%s': a temperature such as 44.2 is required.\n", buf);
        return 0;
    }
    if (*out < -10.0f || *out > 60.0f) {
        printf("  Invalid temperature %.1f: must be between -10 and 60 C.\n", *out);
        return 0;
    }
    return 1;
}

float absf(float x) { return x < 0.0f ? -x : x; }

/* ------------------------------------------------------------------ */
/* Data handling                                                        */
/* ------------------------------------------------------------------ */

void resetData(void)
{
    int i;
    for (i = 0; i < N; i++)
        work[i] = original[i];
    isSorted = 0;
}

void displayRecords(void)
{
    int i;
    printf("  Nagpur daily Tmax, May 2024 - current order: %s\n",
           isSorted ? "SORTED by Tmax (ascending)" : "NOT SORTED (chronological)");
    printf("  Idx Day  Tmax   | Idx Day  Tmax   | Idx Day  Tmax   | Idx Day  Tmax\n");
    for (i = 0; i < N; i++) {
        printf("  %3d %3d  %4.1f%s", i, work[i].day, work[i].tmax, (i % 4 == 3 || i == N - 1) ? "\n" : "   |");
    }
}

/* ------------------------------------------------------------------ */
/* Insertion sort: shift larger elements right, drop key into the gap   */
/* ------------------------------------------------------------------ */
void insertionSort(struct Record a[], int n, long *comparisons, long *shifts)
{
    int i, j;
    struct Record key;

    *comparisons = 0;
    *shifts = 0;
    for (i = 1; i < n; i++) {
        key = a[i];
        j = i - 1;
        while (j >= 0) {
            (*comparisons)++;
            if (a[j].tmax > key.tmax) {
                a[j + 1] = a[j];        /* shift one place right */
                (*shifts)++;
                j--;
            } else {
                break;
            }
        }
        a[j + 1] = key;
    }
}

/* ------------------------------------------------------------------ */
/* Quick sort (Lomuto partition, last element as pivot)                 */
/* ------------------------------------------------------------------ */
void swapRecords(struct Record *x, struct Record *y)
{
    struct Record t = *x;
    *x = *y;
    *y = t;
}

int partition(struct Record a[], int low, int high, long *comparisons, long *swaps)
{
    float pivot = a[high].tmax;
    int i = low - 1, j;

    for (j = low; j < high; j++) {
        (*comparisons)++;
        if (a[j].tmax <= pivot) {
            i++;
            if (i != j) {               /* self-swaps are skipped, not counted */
                swapRecords(&a[i], &a[j]);
                (*swaps)++;
            }
        }
    }
    if (i + 1 != high) {
        swapRecords(&a[i + 1], &a[high]);       /* pivot to its final place */
        (*swaps)++;
    }
    return i + 1;
}

void quickSort(struct Record a[], int low, int high, long *comparisons, long *swaps)
{
    int p;
    if (low < high) {
        p = partition(a, low, high, comparisons, swaps);
        quickSort(a, low, p - 1, comparisons, swaps);
        quickSort(a, p + 1, high, comparisons, swaps);
    }
}

/* ------------------------------------------------------------------ */
/* Binary search (exact match within tolerance)                         */
/* Returns index of a match, or -1 and the insertion position in *pos.  */
/* ------------------------------------------------------------------ */
int binarySearch(const struct Record a[], int n, float key, int *pos, int *probes)
{
    int low = 0, high = n - 1, mid;

    *probes = 0;
    printf("  Probe  low  high  mid  a[mid].tmax\n");
    while (low <= high) {
        mid = (low + high) / 2;
        (*probes)++;
        printf("  %5d  %3d  %4d  %3d  %5.1f", *probes, low, high, mid, a[mid].tmax);
        if (absf(a[mid].tmax - key) <= TOLERANCE) {
            printf("   match\n");
            return mid;
        }
        if (a[mid].tmax < key) {
            printf("   < key, go right\n");
            low = mid + 1;
        } else {
            printf("   > key, go left\n");
            high = mid - 1;
        }
    }
    *pos = low;
    return -1;
}

/* ------------------------------------------------------------------ */
/* Lower bound: first index whose tmax >= x (n if none)                 */
/* ------------------------------------------------------------------ */
int lowerBound(const struct Record a[], int n, float x, int *probes)
{
    int low = 0, high = n, mid;     /* search in [low, high) */

    *probes = 0;
    printf("  Probe  low  high  mid  a[mid].tmax\n");
    while (low < high) {
        mid = (low + high) / 2;
        (*probes)++;
        printf("  %5d  %3d  %4d  %3d  %5.1f", *probes, low, high, mid, a[mid].tmax);
        if (a[mid].tmax >= x - EPS) {
            printf("   >= X, answer at mid or left\n");
            high = mid;
        } else {
            printf("   <  X, go right\n");
            low = mid + 1;
        }
    }
    return low;
}

void doBinarySearch(void)
{
    float key;
    int idx, pos = 0, probes, left, right, i;

    if (!isSorted) {
        printf("  REFUSED: data is not sorted. Binary search needs ascending order -\n");
        printf("  sort first with option 3 (insertion sort) or option 4 (quick sort).\n");
        return;
    }
    if (!readTemp("  Enter temperature to search (deg C): ", &key))
        return;

    idx = binarySearch(work, N, key, &pos, &probes);
    if (idx >= 0) {
        /* equal values sit next to each other in sorted data: collect them all */
        left = idx;
        right = idx;
        while (left > 0 && absf(work[left - 1].tmax - key) <= TOLERANCE) left--;
        while (right < N - 1 && absf(work[right + 1].tmax - key) <= TOLERANCE) right++;
        printf("  FOUND %.1f C after %d probe(s) (sorted index %d). Matching day(s):", key, probes, idx);
        for (i = left; i <= right; i++)
            printf(" %d May (%.1f)", work[i].day, work[i].tmax);
        printf("\n");
    } else {
        printf("  NOT FOUND: no day with %.1f C (+/- %.2f) after %d probe(s).\n", key, TOLERANCE, probes);
        printf("  Insertion position = index %d", pos);
        if (pos == 0)
            printf(" (before the coolest day, %.1f C)\n", work[0].tmax);
        else if (pos == N)
            printf(" (after the hottest day, %.1f C)\n", work[N - 1].tmax);
        else
            printf(" (between %.1f C on %d May and %.1f C on %d May)\n",
                   work[pos - 1].tmax, work[pos - 1].day, work[pos].tmax, work[pos].day);
    }
}

void doCountAtLeast(void)
{
    float x;
    int idx, probes, i, count;

    if (!isSorted) {
        printf("  REFUSED: data is not sorted. The lower-bound binary search needs\n");
        printf("  ascending order - sort first with option 3 or 4.\n");
        return;
    }
    if (!readTemp("  Count days with Tmax >= X. Enter X (deg C): ", &x))
        return;

    idx = lowerBound(work, N, x, &probes);
    count = N - idx;
    printf("  First index with Tmax >= %.1f is %d (found in %d probes).\n", x, idx, probes);
    printf("  Days with Tmax >= %.1f C in May 2024: %d of %d", x, count, N);
    if (count > 0) {
        printf(" ->");
        for (i = idx; i < N; i++)
            printf(" %d(%.1f)", work[i].day, work[i].tmax);
    }
    printf("\n");
}

void printMenu(void)
{
    printf("\n====== HEATSYNC Archive Search (Nagpur Tmax, May 2024) ======\n");
    printf("1. Display records (current order)\n");
    printf("2. Reload original chronological data (unsorted)\n");
    printf("3. Sort by Tmax - insertion sort\n");
    printf("4. Sort by Tmax - quick sort\n");
    printf("5. Binary search for a temperature\n");
    printf("6. Count days with Tmax >= X (lower-bound binary search)\n");
    printf("7. Exit\n");
}

int main(void)
{
    int choice, wasSorted;
    long comparisons, moves;

    resetData();
    while (1) {
        printMenu();
        if (!readInt("Enter your choice: ", &choice)) {
            if (inputEnded) {
                printf("\nEnd of input. Exiting.\n");
                break;
            }
            continue;
        }

        switch (choice) {
        case 1:
            displayRecords();
            break;
        case 2:
            resetData();
            printf("  Original chronological data reloaded. Sorted flag cleared.\n");
            break;
        case 3:
            wasSorted = isSorted;
            insertionSort(work, N, &comparisons, &moves);
            isSorted = 1;
            printf("  Insertion sort on %d records%s:\n", N, wasSorted ? " (input already sorted - best case)" : "");
            printf("    Comparisons = %ld, Shifts (adjacent moves) = %ld\n", comparisons, moves);
            printf("  Sorted flag set. Coolest: %.1f C (%d May), hottest: %.1f C (%d May).\n",
                   work[0].tmax, work[0].day, work[N - 1].tmax, work[N - 1].day);
            break;
        case 4:
            wasSorted = isSorted;
            comparisons = 0;
            moves = 0;
            quickSort(work, 0, N - 1, &comparisons, &moves);
            isSorted = 1;
            printf("  Quick sort on %d records%s:\n", N,
                   wasSorted ? " (input already sorted - worst case for last-element pivot)" : "");
            printf("    Comparisons = %ld, Swaps = %ld\n", comparisons, moves);
            printf("  Sorted flag set. Coolest: %.1f C (%d May), hottest: %.1f C (%d May).\n",
                   work[0].tmax, work[0].day, work[N - 1].tmax, work[N - 1].day);
            break;
        case 5:
            doBinarySearch();
            break;
        case 6:
            doCountAtLeast();
            break;
        case 7:
            printf("  Exiting archive search.\n");
            return 0;
        default:
            printf("  Invalid choice %d. Please enter 1-7.\n", choice);
        }
    }
    return 0;
}
