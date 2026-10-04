/*
 * Experiment 1 : AWS Station Registry
 *
 * Aim: Implement and demonstrate the use of arrays, array of structure and
 *      pointers using C.
 *
 * Use-case mapping: HEATSYNC is a heatwave response engine for Maharashtra
 * built for use case KJS-CES-01 (Climate Intelligence for Heatwave Monitoring,
 * Prediction, and Early Warning). Every alert it raises starts from a known list
 * of Automated Weather Stations (AWS). This program is that registry: a
 * fixed-capacity array of struct Station, where each element records the
 * station id, its short code, the district it reports for and the latest daily
 * maximum temperature (Tmax). All operations receive a pointer to the array and
 * walk it with structure pointers. Insert/delete happen at the last position
 * (the way a field officer appends or withdraws the most recent station), search
 * finds a station by code or district (case-insensitive) and the table view
 * flags each Tmax against the IMD absolute thresholds (40 C, 45 C, 47 C) so an
 * operator can see at a glance which districts need a departure check.
 *
 * Build: gcc -std=c99 -Wall -Wextra -o exp1_station_registry.exe exp1_station_registry.c
 */

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <ctype.h>

#define MAX_STATIONS 5      /* fixed capacity of the registry array */
#define CODE_LEN     8      /* 7 characters + '\0' */
#define NAME_LEN     32     /* 31 characters + '\0' */
#define LINE_LEN     128

struct Station {
    int   id;
    char  code[CODE_LEN];
    char  district[NAME_LEN];
    float tmax;             /* daily maximum temperature, deg C */
};

struct Station registry[MAX_STATIONS];   /* array of structures */
int stationCount = 0;                    /* number of filled positions */
int inputEnded = 0;                      /* set when stdin reaches end of file */

/* ------------------------------------------------------------------ */
/* Input helpers: always read a whole line so bad input never jams the  */
/* menu. Numbers are parsed by hand.                                    */
/* ------------------------------------------------------------------ */

/* Reads one line into buf (newline removed). Returns 0 at end of input. */
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
        while ((c = getchar()) != '\n' && c != EOF)   /* drop rest of long line */
            ;
    if (len > 0 && buf[len - 1] == '\r')
        buf[--len] = '\0';
#ifdef ECHO_INPUT
    printf("%s\n", buf);   /* echo for recorded transcripts */
#endif
    return 1;
}

/* Removes leading and trailing spaces in place. */
void trim(char *s)
{
    int start = 0, end = (int)strlen(s) - 1, i;
    while (s[start] != '\0' && isspace((unsigned char)s[start]))
        start++;
    while (end >= start && isspace((unsigned char)s[end]))
        end--;
    for (i = start; i <= end; i++)
        s[i - start] = s[i];
    s[end - start + 1] = '\0';
}

/* Parses a whole number. Returns 1 on success. */
int parseInt(const char *s, int *out)
{
    int i = 0, sign = 1, value = 0, digits = 0;
    while (isspace((unsigned char)s[i])) i++;
    if (s[i] == '+' || s[i] == '-') {
        if (s[i] == '-') sign = -1;
        i++;
    }
    while (isdigit((unsigned char)s[i])) {
        if (value > 10000000) return 0;           /* too large */
        value = value * 10 + (s[i] - '0');
        i++;
        digits++;
    }
    while (isspace((unsigned char)s[i])) i++;
    if (digits == 0 || s[i] != '\0') return 0;
    *out = sign * value;
    return 1;
}

/* Parses a decimal number such as 44.2. Returns 1 on success. */
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

int readFloat(const char *prompt, float *out)
{
    char buf[LINE_LEN];
    printf("%s", prompt);
    if (!readLine(buf, LINE_LEN)) return 0;
    if (!parseFloat(buf, out)) {
        printf("  Invalid input '%s': a number such as 43.2 is required.\n", buf);
        return 0;
    }
    return 1;
}

/* Reads a trimmed text line. Returns 0 at end of input. */
int readText(const char *prompt, char *buf, int size)
{
    printf("%s", prompt);
    if (!readLine(buf, size)) return 0;
    trim(buf);
    return 1;
}

/* ------------------------------------------------------------------ */
/* String utilities written by hand                                     */
/* ------------------------------------------------------------------ */

/* Case-insensitive comparison: returns 1 when both strings match. */
int equalsIgnoreCase(const char *a, const char *b)
{
    while (*a != '\0' && *b != '\0') {
        if (tolower((unsigned char)*a) != tolower((unsigned char)*b))
            return 0;
        a++;
        b++;
    }
    return *a == '\0' && *b == '\0';
}

/* Station code: 1..7 characters, letters, digits or '-'. */
int isValidCode(const char *s)
{
    int len = (int)strlen(s), i;
    if (len == 0 || len >= CODE_LEN) return 0;
    for (i = 0; i < len; i++)
        if (!isalnum((unsigned char)s[i]) && s[i] != '-')
            return 0;
    return 1;
}

/* District name: 1..31 characters, letters, spaces, '.', '-' only. */
int isValidName(const char *s)
{
    int len = (int)strlen(s), i, letters = 0;
    if (len == 0 || len >= NAME_LEN) return 0;
    for (i = 0; i < len; i++) {
        if (isalpha((unsigned char)s[i])) letters++;
        else if (s[i] != ' ' && s[i] != '.' && s[i] != '-') return 0;
    }
    return letters > 0;
}

/* IMD absolute-temperature screening for a plains station. */
const char *heatFlag(float tmax)
{
    if (tmax >= 47.0f) return "SEVERE HW (>=47)";
    if (tmax >= 45.0f) return "HEATWAVE (>=45)";
    if (tmax >= 40.0f) return "WATCH (>=40)";
    return "normal";
}

/* ------------------------------------------------------------------ */
/* Registry operations (all use pointers to the array of structures)    */
/* ------------------------------------------------------------------ */

void printLine(void)
{
    printf("  +-----+------+---------+---------------------------+--------+------------------+\n");
}

void printHeader(void)
{
    printLine();
    printf("  | Pos | ID   | Code    | District                  | Tmax C | IMD Tmax flag    |\n");
    printLine();
}

void printRow(int pos, const struct Station *s)
{
    printf("  | %3d | %-4d | %-7s | %-25.25s | %6.1f | %-16s |\n",
           pos, s->id, s->code, s->district, s->tmax, heatFlag(s->tmax));
}

/* Returns a pointer to the station with this id, or NULL. */
struct Station *findById(struct Station *arr, int n, int id)
{
    struct Station *p;
    for (p = arr; p < arr + n; p++)
        if (p->id == id)
            return p;
    return NULL;
}

/* Returns a pointer to the station with this code (any case), or NULL. */
struct Station *findByCode(struct Station *arr, int n, const char *code)
{
    struct Station *p;
    for (p = arr; p < arr + n; p++)
        if (equalsIgnoreCase(p->code, code))
            return p;
    return NULL;
}

/* Inserts at the last position. Returns 0 on overflow. */
int insertLast(struct Station *arr, int *n, const struct Station *s)
{
    if (*n >= MAX_STATIONS)
        return 0;
    *(arr + *n) = *s;          /* copy the whole structure */
    (*n)++;
    return 1;
}

/* Deletes from the last position. Returns 0 on underflow. */
int deleteLast(struct Station *arr, int *n, struct Station *removed)
{
    if (*n == 0)
        return 0;
    (*n)--;
    *removed = *(arr + *n);
    return 1;
}

/* Prints every station whose code or district matches text. Returns matches. */
int searchStations(struct Station *arr, int n, const char *text)
{
    struct Station *p;
    int found = 0;
    for (p = arr; p < arr + n; p++) {
        if (equalsIgnoreCase(p->code, text) || equalsIgnoreCase(p->district, text)) {
            if (found == 0)
                printHeader();
            printRow((int)(p - arr) + 1, p);
            found++;
        }
    }
    if (found > 0)
        printLine();
    return found;
}

/* Displays the complete list plus a short summary found with a pointer scan. */
void displayAll(struct Station *arr, int n)
{
    struct Station *p, *hottest;
    int watch = 0;

    if (n == 0) {
        printf("  Registry is empty. No stations to display.\n");
        return;
    }
    printf("  AWS registry (%d of %d positions used)\n", n, MAX_STATIONS);
    printHeader();
    hottest = arr;
    for (p = arr; p < arr + n; p++) {
        printRow((int)(p - arr) + 1, p);
        if (p->tmax > hottest->tmax)
            hottest = p;
        if (p->tmax >= 40.0f)
            watch++;
    }
    printLine();
    printf("  Hottest station : %s (%s) at %.1f C\n", hottest->code, hottest->district, hottest->tmax);
    printf("  Stations >= 40 C: %d of %d (need departure-from-normal check for IMD heatwave)\n", watch, n);
}

/* Reads and validates all fields of a new station into *s. */
int readStation(struct Station *arr, int n, struct Station *s)
{
    char buf[LINE_LEN];
    int i;

    if (!readInt("  Enter station id (positive integer): ", &s->id))
        return 0;
    if (s->id <= 0) {
        printf("  Invalid id %d: id must be positive.\n", s->id);
        return 0;
    }
    if (findById(arr, n, s->id) != NULL) {
        printf("  Duplicate id %d: a station with this id already exists.\n", s->id);
        return 0;
    }

    if (!readText("  Enter station code (max 7 chars, e.g. NGP01): ", buf, LINE_LEN))
        return 0;
    if (!isValidCode(buf)) {
        printf("  Invalid code '%s': use 1-7 letters/digits/'-'.\n", buf);
        return 0;
    }
    for (i = 0; buf[i] != '\0'; i++)
        buf[i] = (char)toupper((unsigned char)buf[i]);
    if (findByCode(arr, n, buf) != NULL) {
        printf("  Duplicate code %s: code already registered.\n", buf);
        return 0;
    }
    strcpy(s->code, buf);

    if (!readText("  Enter district name: ", buf, LINE_LEN))
        return 0;
    if (!isValidName(buf)) {
        printf("  Invalid district name '%s': use 1-31 letters/spaces.\n", buf);
        return 0;
    }
    strcpy(s->district, buf);

    if (!readFloat("  Enter Tmax (deg C): ", &s->tmax))
        return 0;
    if (s->tmax < -10.0f || s->tmax > 60.0f) {
        printf("  Invalid Tmax %.1f: must lie between -10 and 60 C.\n", s->tmax);
        return 0;
    }
    return 1;
}

void printMenu(void)
{
    printf("\n========= HEATSYNC AWS Station Registry (capacity %d) =========\n", MAX_STATIONS);
    printf("1. Insert station at last position\n");
    printf("2. Delete station from last position\n");
    printf("3. Search station (by code or district)\n");
    printf("4. Display complete registry\n");
    printf("5. Exit\n");
}

int main(void)
{
    int choice;
    char text[LINE_LEN];
    struct Station s, removed;

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
            if (stationCount >= MAX_STATIONS) {
                printf("  OVERFLOW: registry is full (%d/%d). Delete a station first.\n",
                       stationCount, MAX_STATIONS);
                break;
            }
            if (readStation(registry, stationCount, &s)) {
                insertLast(registry, &stationCount, &s);
                printf("  Inserted %s (%s, %.1f C) at position %d.\n",
                       s.code, s.district, s.tmax, stationCount);
            } else {
                printf("  Insert cancelled.\n");
            }
            break;

        case 2:
            if (deleteLast(registry, &stationCount, &removed))
                printf("  Deleted last station: %s (%s, %.1f C). %d station(s) remain.\n",
                       removed.code, removed.district, removed.tmax, stationCount);
            else
                printf("  UNDERFLOW: registry is empty, nothing to delete.\n");
            break;

        case 3:
            if (stationCount == 0) {
                printf("  Registry is empty. Nothing to search.\n");
                break;
            }
            if (!readText("  Enter station code or district name: ", text, LINE_LEN))
                break;
            if (text[0] == '\0') {
                printf("  Invalid input: search text cannot be empty.\n");
                break;
            }
            if (searchStations(registry, stationCount, text) == 0)
                printf("  Not found: no station with code or district '%s'.\n", text);
            break;

        case 4:
            displayAll(registry, stationCount);
            break;

        case 5:
            printf("  Exiting station registry.\n");
            return 0;

        default:
            printf("  Invalid choice %d. Please enter 1-5.\n", choice);
        }
    }
    return 0;
}
