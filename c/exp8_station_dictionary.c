/*
 * Experiment 8 : District Station Dictionary
 *
 * Aim: Demonstrate the use hash table in implementation of Dictionary using
 *      Circular Array.
 *
 * Use-case mapping: HEATSYNC (heatwave response engine for Maharashtra, use
 * case KJS-CES-01) constantly looks up a district by name - when a reading
 * arrives, when an alert is composed, or when a citizen types a district into
 * the warning app - to fetch its headquarters PIN code and latest Tmax. A
 * dictionary implemented as a hash table gives this lookup in near-constant
 * time. The table is a circular array of 13 slots (13 is prime); the key is
 * the lowercase district name, hashed with a polynomial rolling hash, and
 * collisions are resolved by linear probing, index = (h + i) % SIZE, which
 * wraps around the end of the array. Inserting an existing key updates its
 * value (a fresh reading), deletion leaves a DELETED tombstone so that later
 * searches keep probing past it, and a full cycle of probes without a free
 * slot reports that the table is full.
 *
 * Data: district headquarters PIN codes from the HEATSYNC district file; Tmax
 *       for 2024-05-28 from ERA5 reanalysis via Open-Meteo (CC BY 4.0).
 *
 * Build: gcc -std=c99 -Wall -Wextra -o exp8_station_dictionary.exe exp8_station_dictionary.c
 */

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <ctype.h>

#define SIZE     13         /* prime table size */
#define KEY_LEN  32
#define PIN_LEN  7          /* 6 digits + '\0' */
#define LINE_LEN 128
#define BASE     31         /* multiplier of the polynomial rolling hash */

#define EMPTY    0
#define OCCUPIED 1
#define DELETED  2

struct Entry {
    char  key[KEY_LEN];     /* district name in lowercase */
    char  pin[PIN_LEN];     /* headquarters PIN code */
    float tmax;             /* latest Tmax, deg C */
    int   status;           /* EMPTY / OCCUPIED / DELETED */
};

struct Entry table[SIZE];   /* the circular array */
int occupied = 0;
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

/* Reads a district name, converts to lowercase and validates it. */
int readKey(const char *prompt, char *key)
{
    char buf[LINE_LEN];
    int i, len, letters = 0;

    printf("%s", prompt);
    if (!readLine(buf, LINE_LEN))
        return 0;
    trim(buf);
    len = (int)strlen(buf);
    if (len == 0 || len >= KEY_LEN) {
        printf("  Invalid key: district name must be 1-%d characters.\n", KEY_LEN - 1);
        return 0;
    }
    for (i = 0; i < len; i++) {
        if (isalpha((unsigned char)buf[i])) {
            buf[i] = (char)tolower((unsigned char)buf[i]);
            letters++;
        } else if (buf[i] != ' ' && buf[i] != '-') {
            printf("  Invalid key '%s': only letters, spaces and '-' are allowed.\n", buf);
            return 0;
        }
    }
    if (letters == 0) {
        printf("  Invalid key: name must contain letters.\n");
        return 0;
    }
    strcpy(key, buf);
    return 1;
}

/* PIN code: exactly 6 digits; Maharashtra PIN codes start with 4. */
int readPin(char *pin)
{
    char buf[LINE_LEN];
    int i;

    printf("  Enter HQ PIN code (6 digits): ");
    if (!readLine(buf, LINE_LEN))
        return 0;
    trim(buf);
    if (strlen(buf) != 6) {
        printf("  Invalid PIN '%s': must be exactly 6 digits.\n", buf);
        return 0;
    }
    for (i = 0; i < 6; i++) {
        if (!isdigit((unsigned char)buf[i])) {
            printf("  Invalid PIN '%s': digits only.\n", buf);
            return 0;
        }
    }
    if (buf[0] != '4') {
        printf("  Invalid PIN '%s': Maharashtra PIN codes start with 4.\n", buf);
        return 0;
    }
    strcpy(pin, buf);
    return 1;
}

int readTmax(float *t)
{
    char buf[LINE_LEN];
    printf("  Enter latest Tmax (deg C): ");
    if (!readLine(buf, LINE_LEN))
        return 0;
    if (!parseFloat(buf, t)) {
        printf("  Invalid input '%s': a number such as 43.2 is required.\n", buf);
        return 0;
    }
    if (*t < -10.0f || *t > 60.0f) {
        printf("  Invalid Tmax %.1f: must be between -10 and 60 C.\n", *t);
        return 0;
    }
    return 1;
}

/* ------------------------------------------------------------------ */
/* Hash table                                                           */
/* ------------------------------------------------------------------ */

void initTable(void)
{
    int i;
    for (i = 0; i < SIZE; i++) {
        table[i].status = EMPTY;
        table[i].key[0] = '\0';
        table[i].pin[0] = '\0';
        table[i].tmax = 0.0f;
    }
    occupied = 0;
}

/* Polynomial rolling hash (Horner's rule): h = (h * 31 + c) mod SIZE. */
int hashKey(const char *key)
{
    int h = 0, i;
    for (i = 0; key[i] != '\0'; i++)
        h = (h * BASE + (unsigned char)key[i]) % SIZE;
    return h;
}

const char *statusName(int s)
{
    return s == OCCUPIED ? "OCCUPIED" : (s == DELETED ? "DELETED" : "EMPTY");
}

/* Prints one probe step such as  [5] DELETED  or  [6] OCCUPIED (nagpur). */
void printProbe(int step, int idx)
{
    printf("    probe %2d: slot %2d  %s", step, idx, statusName(table[idx].status));
    if (table[idx].status == OCCUPIED)
        printf(" (%s)", table[idx].key);
    printf("\n");
}

/* Result codes for insert */
#define INS_NEW     1
#define INS_UPDATED 2
#define INS_FULL    0

/*
 * Insert or update. Probe (h + i) % SIZE for i = 0..SIZE-1:
 *   OCCUPIED with same key  -> update value
 *   DELETED                 -> remember first tombstone, keep probing
 *   EMPTY                   -> key is absent, stop
 * The new key goes into the first tombstone seen, else the empty slot.
 */
int insertEntry(const char *key, const char *pin, float tmax, int *slot)
{
    int h = hashKey(key), i, idx = h, firstDeleted = -1, foundEmpty = 0;

    printf("  hash(\"%s\") = %d\n", key, h);
    for (i = 0; i < SIZE; i++) {
        idx = (h + i) % SIZE;
        printProbe(i + 1, idx);
        if (table[idx].status == OCCUPIED) {
            if (strcmp(table[idx].key, key) == 0) {
                strcpy(table[idx].pin, pin);
                table[idx].tmax = tmax;
                *slot = idx;
                return INS_UPDATED;
            }
        } else if (table[idx].status == DELETED) {
            if (firstDeleted == -1)
                firstDeleted = idx;
        } else {
            foundEmpty = 1;
            break;
        }
    }
    if (firstDeleted != -1)
        idx = firstDeleted;                     /* reuse tombstone */
    else if (!foundEmpty)
        return INS_FULL;                        /* full cycle, no free slot */

    strcpy(table[idx].key, key);
    strcpy(table[idx].pin, pin);
    table[idx].tmax = tmax;
    table[idx].status = OCCUPIED;
    occupied++;
    *slot = idx;
    return INS_NEW;
}

/*
 * Search: probe until the key is found, an EMPTY slot is met (key absent)
 * or all SIZE slots have been probed. DELETED slots are skipped, not stops.
 */
int searchEntry(const char *key, int *probes)
{
    int h = hashKey(key), i, idx;

    printf("  hash(\"%s\") = %d\n", key, h);
    for (i = 0; i < SIZE; i++) {
        idx = (h + i) % SIZE;
        printProbe(i + 1, idx);
        *probes = i + 1;
        if (table[idx].status == EMPTY)
            return -1;
        if (table[idx].status == OCCUPIED && strcmp(table[idx].key, key) == 0)
            return idx;
    }
    return -1;                                  /* probed the whole circle */
}

/* Delete: find the key, then mark its slot as a DELETED tombstone. */
int deleteEntry(const char *key, int *probes)
{
    int idx = searchEntry(key, probes);
    if (idx < 0)
        return -1;
    table[idx].status = DELETED;                /* key text kept only for display */
    occupied--;
    return idx;
}

void displayTable(void)
{
    int i, home;
    char was[KEY_LEN + 8];

    printf("  Hash table (SIZE = %d): %d occupied, load factor = %.2f\n",
           SIZE, occupied, (float)occupied / SIZE);
    printf("  +------+----------+---------------------------+--------+--------+------+-------+\n");
    printf("  | Slot | Status   | Key (district)            | PIN    | Tmax C | Home | Probe |\n");
    printf("  +------+----------+---------------------------+--------+--------+------+-------+\n");
    for (i = 0; i < SIZE; i++) {
        printf("  | %4d | %-8s | ", i, statusName(table[i].status));
        if (table[i].status == OCCUPIED) {
            home = hashKey(table[i].key);
            printf("%-25.25s | %-6s | %6.1f | %4d | %5d |\n", table[i].key, table[i].pin,
                   table[i].tmax, home, (i - home + SIZE) % SIZE + 1);
        } else if (table[i].status == DELETED) {
            sprintf(was, "(was %s)", table[i].key);        /* tombstone keeps old name */
            printf("%-25.25s | %-6s | %6s | %4s | %5s |\n", was, "-", "-", "-", "-");
        } else {
            printf("%-25s | %-6s | %6s | %4s | %5s |\n", "-", "-", "-", "-", "-");
        }
    }
    printf("  +------+----------+---------------------------+--------+--------+------+-------+\n");
    printf("  Home = hash(key); Probe = number of probes needed to reach the slot (1 = no collision).\n");
}

void printMenu(void)
{
    printf("\n===== HEATSYNC Station Dictionary (hash table, SIZE = %d) =====\n", SIZE);
    printf("1. Insert / update district\n");
    printf("2. Search district\n");
    printf("3. Delete district\n");
    printf("4. Display all slots\n");
    printf("5. Exit\n");
}

int main(void)
{
    int choice, slot = 0, result, probes = 0;
    char key[KEY_LEN], pin[PIN_LEN];
    float tmax;

    initTable();
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
            if (!readKey("  Enter district name (key): ", key)) break;
            if (!readPin(pin)) break;
            if (!readTmax(&tmax)) break;
            result = insertEntry(key, pin, tmax, &slot);
            if (result == INS_NEW)
                printf("  Inserted \"%s\" at slot %d. (%d/%d occupied)\n", key, slot, occupied, SIZE);
            else if (result == INS_UPDATED)
                printf("  Key \"%s\" already present at slot %d: value updated (PIN %s, Tmax %.1f C).\n",
                       key, slot, pin, tmax);
            else
                printf("  TABLE FULL: probed all %d slots, no free slot for \"%s\".\n", SIZE, key);
            break;

        case 2:
            if (occupied == 0) {
                printf("  Dictionary is empty. Nothing to search.\n");
                break;
            }
            if (!readKey("  Enter district name to search: ", key)) break;
            slot = searchEntry(key, &probes);
            if (slot >= 0)
                printf("  FOUND \"%s\" at slot %d after %d probe(s): PIN %s, Tmax %.1f C.\n",
                       key, slot, probes, table[slot].pin, table[slot].tmax);
            else
                printf("  NOT FOUND: \"%s\" is not in the dictionary (%d probe(s)).\n", key, probes);
            break;

        case 3:
            if (occupied == 0) {
                printf("  UNDERFLOW: dictionary is empty, nothing to delete.\n");
                break;
            }
            if (!readKey("  Enter district name to delete: ", key)) break;
            slot = deleteEntry(key, &probes);
            if (slot >= 0)
                printf("  Deleted \"%s\": slot %d marked DELETED (tombstone). (%d/%d occupied)\n",
                       key, slot, occupied, SIZE);
            else
                printf("  NOT FOUND: \"%s\" is not in the dictionary, nothing deleted.\n", key);
            break;

        case 4:
            displayTable();
            break;

        case 5:
            printf("  Exiting station dictionary.\n");
            return 0;

        default:
            printf("  Invalid choice %d. Please enter 1-5.\n", choice);
        }
    }
    return 0;
}
