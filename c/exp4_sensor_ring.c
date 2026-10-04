/*
 * Experiment 4 : AWS Sensor Ring Buffer
 *
 * Aim: Write a menu driven program to implement a static circular queue using
 *      counter method.
 *
 * Use-case mapping: In HEATSYNC (heatwave response engine for Maharashtra,
 * use case KJS-CES-01) each Automated Weather Station pushes one temperature
 * reading every hour, and the engine only needs the most recent few hours to
 * judge whether a heat spell is building (rolling maximum and mean). A static
 * circular queue is the natural ring buffer for this: the oldest reading is
 * dequeued from the front, the newest is enqueued at the rear, and the indices
 * wrap around with (index + 1) % MAX so the fixed array is reused forever with
 * no shifting. Method 1 (counter method) keeps a count of stored readings so
 * all MAX slots are usable; Method 2 keeps one slot empty and needs no counter.
 * Both are provided and can be switched from the menu. MAX is kept small (6)
 * so full, empty and wrap-around states are easy to see.
 *
 * Build: gcc -std=c99 -Wall -Wextra -o exp4_sensor_ring.exe exp4_sensor_ring.c
 */

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <ctype.h>

#define MAX      6
#define LINE_LEN 128

struct Reading {
    int   hour;     /* 0..23, local time of the observation */
    float temp;     /* air temperature, deg C */
};

/* ---------------- Method 1 : counter method ---------------- */
struct Reading q1[MAX];
int front1 = 0, rear1 = -1, count1 = 0;

/* ---------------- Method 2 : one slot kept empty ----------- */
struct Reading q2[MAX];
int front2 = 0, rear2 = 0;      /* front2 points one slot behind the first item */

int method = 1;                 /* active method selected from the menu */
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

int readFloat(const char *prompt, float *out)
{
    char buf[LINE_LEN];
    printf("%s", prompt);
    if (!readLine(buf, LINE_LEN)) return 0;
    if (!parseFloat(buf, out)) {
        printf("  Invalid input '%s': a number such as 41.7 is required.\n", buf);
        return 0;
    }
    return 1;
}

/* ------------------------------------------------------------------ */
/* Method 1 : counter method                                            */
/*   empty when count == 0, full when count == MAX                      */
/* ------------------------------------------------------------------ */

int isEmpty1(void) { return count1 == 0; }
int isFull1(void)  { return count1 == MAX; }

int enqueue1(struct Reading r)
{
    if (isFull1())
        return 0;                       /* overflow */
    rear1 = (rear1 + 1) % MAX;          /* circular increment */
    q1[rear1] = r;
    count1++;
    return 1;
}

int dequeue1(struct Reading *r)
{
    if (isEmpty1())
        return 0;                       /* underflow */
    *r = q1[front1];
    front1 = (front1 + 1) % MAX;        /* circular increment */
    count1--;
    return 1;
}

int peek1(struct Reading *r)
{
    if (isEmpty1())
        return 0;
    *r = q1[front1];
    return 1;
}

/* ------------------------------------------------------------------ */
/* Method 2 : one slot always left empty (no counter)                   */
/*   empty when front == rear, full when (rear + 1) % MAX == front      */
/*   so only MAX - 1 readings can be stored                             */
/* ------------------------------------------------------------------ */

int isEmpty2(void) { return front2 == rear2; }
int isFull2(void)  { return (rear2 + 1) % MAX == front2; }

int enqueue2(struct Reading r)
{
    if (isFull2())
        return 0;
    rear2 = (rear2 + 1) % MAX;
    q2[rear2] = r;
    return 1;
}

int dequeue2(struct Reading *r)
{
    if (isEmpty2())
        return 0;
    front2 = (front2 + 1) % MAX;
    *r = q2[front2];
    return 1;
}

int peek2(struct Reading *r)
{
    if (isEmpty2())
        return 0;
    *r = q2[(front2 + 1) % MAX];
    return 1;
}

/* ------------------------------------------------------------------ */
/* Helpers that work for whichever method is active                     */
/* ------------------------------------------------------------------ */

int capacity(void) { return method == 1 ? MAX : MAX - 1; }

int queueSize(void)
{
    if (method == 1)
        return count1;
    return (rear2 - front2 + MAX) % MAX;
}

/* Array slot holding the pos-th reading counted from the front (pos from 0). */
int slotAt(int pos)
{
    if (method == 1)
        return (front1 + pos) % MAX;
    return (front2 + 1 + pos) % MAX;
}

struct Reading *activeArray(void) { return method == 1 ? q1 : q2; }

int enqueue(struct Reading r)   { return method == 1 ? enqueue1(r) : enqueue2(r); }
int dequeue(struct Reading *r)  { return method == 1 ? dequeue1(r) : dequeue2(r); }
int peekFront(struct Reading *r){ return method == 1 ? peek1(r) : peek2(r); }
int isFull(void)                { return method == 1 ? isFull1() : isFull2(); }

void printPointers(void)
{
    if (method == 1)
        printf("  [Method 1] front = %d, rear = %d, count = %d / %d\n",
               front1, rear1, count1, MAX);
    else
        printf("  [Method 2] front = %d, rear = %d, stored = %d / %d (one slot kept empty)\n",
               front2, rear2, queueSize(), MAX - 1);
}

/* Returns 1 if a reading for this hour is already buffered. */
int hourBuffered(int hour)
{
    int pos, n = queueSize();
    struct Reading *a = activeArray();
    for (pos = 0; pos < n; pos++)
        if (a[slotAt(pos)].hour == hour)
            return 1;
    return 0;
}

/* Shows the queue in queue order and the raw array with occupied slots. */
void display(void)
{
    int pos, slot, n = queueSize();
    int used[MAX];
    struct Reading *a = activeArray();

    printPointers();
    if (n == 0) {
        printf("  Queue is empty: no readings buffered.\n");
        return;
    }
    printf("  +-----+------+-------+--------+\n");
    printf("  | Pos | Slot | Hour  | Temp C |\n");
    printf("  +-----+------+-------+--------+\n");
    for (pos = 0; pos < n; pos++) {
        slot = slotAt(pos);
        printf("  | %3d | %4d | %02d:00 | %6.1f |%s\n", pos + 1, slot,
               a[slot].hour, a[slot].temp,
               pos == 0 ? "  <- front (oldest)" : (pos == n - 1 ? "  <- rear (newest)" : ""));
    }
    printf("  +-----+------+-------+--------+\n");

    /* raw array view: which physical slots are in use */
    for (slot = 0; slot < MAX; slot++)
        used[slot] = 0;
    for (pos = 0; pos < n; pos++)
        used[slotAt(pos)] = 1;
    printf("  Array: ");
    for (slot = 0; slot < MAX; slot++) {
        if (used[slot])
            printf("[%d:%02dh %.1f] ", slot, a[slot].hour, a[slot].temp);
        else
            printf("[%d: ---- ] ", slot);
    }
    printf("\n");
}

/* Rolling statistics over all buffered readings. */
void rollingStats(void)
{
    int pos, n = queueSize(), hot = 0;
    struct Reading *a = activeArray(), *r, *maxR, *minR;
    float sum = 0.0f;

    if (n == 0) {
        printf("  Queue is empty: no readings to summarise.\n");
        return;
    }
    maxR = minR = &a[slotAt(0)];
    for (pos = 0; pos < n; pos++) {
        r = &a[slotAt(pos)];
        sum += r->temp;
        if (r->temp > maxR->temp) maxR = r;
        if (r->temp < minR->temp) minR = r;
        if (r->temp >= 40.0f) hot++;
    }
    printf("  Rolling window: %d reading(s), %02d:00 to %02d:00\n",
           n, a[slotAt(0)].hour, a[slotAt(n - 1)].hour);
    printf("    Rolling max  : %.1f C at %02d:00\n", maxR->temp, maxR->hour);
    printf("    Rolling min  : %.1f C at %02d:00\n", minR->temp, minR->hour);
    printf("    Rolling mean : %.2f C\n", sum / n);
    printf("    Hours >= 40 C: %d of %d\n", hot, n);
    if (maxR->temp >= 45.0f)
        printf("    Status       : window max >= 45 C (IMD absolute heatwave threshold reached)\n");
    else if (maxR->temp >= 40.0f)
        printf("    Status       : window max >= 40 C (heat building, check departure)\n");
    else
        printf("    Status       : below 40 C\n");
}

void printMenu(void)
{
    printf("\n====== HEATSYNC Sensor Ring (static circular queue, MAX = %d) ======\n", MAX);
    if (method == 1)
        printf("Active: Method 1 - counter method (capacity %d)\n", MAX);
    else
        printf("Active: Method 2 - one slot left empty (capacity %d)\n", MAX - 1);
    printf("1. Enqueue hourly reading\n");
    printf("2. Dequeue oldest reading\n");
    printf("3. Peek front reading\n");
    printf("4. Display queue\n");
    printf("5. Rolling max / mean of buffered readings\n");
    printf("6. Switch method (1 <-> 2)\n");
    printf("7. Exit\n");
}

int main(void)
{
    int choice;
    struct Reading r;

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
            if (isFull()) {
                printf("  OVERFLOW: queue is full (%d readings). Dequeue first.\n", capacity());
                printPointers();
                break;
            }
            if (!readInt("  Enter hour (0-23): ", &r.hour))
                break;
            if (r.hour < 0 || r.hour > 23) {
                printf("  Invalid hour %d: must be 0-23.\n", r.hour);
                break;
            }
            if (hourBuffered(r.hour)) {
                printf("  Duplicate: a reading for %02d:00 is already buffered.\n", r.hour);
                break;
            }
            if (!readFloat("  Enter temperature (deg C): ", &r.temp))
                break;
            if (r.temp < -10.0f || r.temp > 60.0f) {
                printf("  Invalid temperature %.1f: must be -10 to 60 C.\n", r.temp);
                break;
            }
            enqueue(r);
            printf("  Enqueued %02d:00 = %.1f C at slot %d.\n", r.hour, r.temp,
                   method == 1 ? rear1 : rear2);
            printPointers();
            break;

        case 2:
            if (!dequeue(&r)) {
                printf("  UNDERFLOW: queue is empty, nothing to dequeue.\n");
                break;
            }
            printf("  Dequeued %02d:00 = %.1f C (oldest reading).\n", r.hour, r.temp);
            printPointers();
            break;

        case 3:
            if (peekFront(&r))
                printf("  Front reading: %02d:00 = %.1f C\n", r.hour, r.temp);
            else
                printf("  Queue is empty: no front reading.\n");
            break;

        case 4:
            display();
            break;

        case 5:
            rollingStats();
            break;

        case 6:
            method = (method == 1) ? 2 : 1;
            printf("  Switched to Method %d (%s). Each method keeps its own queue.\n", method,
                   method == 1 ? "counter method, capacity 6" : "one slot left empty, capacity 5");
            printPointers();
            break;

        case 7:
            printf("  Exiting sensor ring.\n");
            return 0;

        default:
            printf("  Invalid choice %d. Please enter 1-7.\n", choice);
        }
    }
    return 0;
}
