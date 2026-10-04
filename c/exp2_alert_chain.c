/*
 * Experiment 2 : Heat Advisory Alert Chain
 *
 * Aim: Implementing Singly Linked List (SLL) supporting following operations
 *      using menu driven program: Insert at the Begin, Insert after the
 *      specified existing node, Delete before the specified existing node,
 *      Display all elements in tabular form.
 *
 * Use-case mapping: In HEATSYNC (heatwave response engine for Maharashtra,
 * use case KJS-CES-01) every district advisory issued during a heat spell is a
 * bulletin carrying the IMD colour level (GREEN = no action, YELLOW = be
 * updated, ORANGE = be prepared, RED = take action) and the Tmax that triggered
 * it. Bulletins arrive one at a time and their number is not known in advance,
 * so they are kept in a singly linked list: the newest bulletin is inserted at
 * the beginning (latest first, like a live alert feed), a follow-up bulletin is
 * inserted right after the bulletin it updates, and when a bulletin is
 * superseded the one immediately before a given bulletin can be withdrawn. The
 * tabular display is the alert log an emergency operations centre would read.
 *
 * Build: gcc -std=c99 -Wall -Wextra -o exp2_alert_chain.exe exp2_alert_chain.c
 */

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <ctype.h>

#define NAME_LEN  32
#define LEVEL_LEN 10
#define LINE_LEN  128

struct Bulletin {
    int   bulletinNo;            /* unique key used to specify a node */
    char  district[NAME_LEN];
    char  level[LEVEL_LEN];      /* GREEN / YELLOW / ORANGE / RED */
    float tmax;                  /* deg C */
    struct Bulletin *next;
};

struct Bulletin *head = NULL;
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

int readText(const char *prompt, char *buf, int size)
{
    printf("%s", prompt);
    if (!readLine(buf, size)) return 0;
    trim(buf);
    return 1;
}

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

/* Converts s to upper case and checks it is one of the four IMD levels. */
int normaliseLevel(char *s)
{
    int i;
    for (i = 0; s[i] != '\0'; i++)
        s[i] = (char)toupper((unsigned char)s[i]);
    return strcmp(s, "GREEN") == 0 || strcmp(s, "YELLOW") == 0 ||
           strcmp(s, "ORANGE") == 0 || strcmp(s, "RED") == 0;
}

/* ------------------------------------------------------------------ */
/* Singly linked list operations                                        */
/* ------------------------------------------------------------------ */

/* Returns the node with this bulletin number, or NULL. */
struct Bulletin *findBulletin(int no)
{
    struct Bulletin *p = head;
    while (p != NULL) {
        if (p->bulletinNo == no)
            return p;
        p = p->next;
    }
    return NULL;
}

int countNodes(void)
{
    int n = 0;
    struct Bulletin *p;
    for (p = head; p != NULL; p = p->next)
        n++;
    return n;
}

/* Reads all fields of a new bulletin and allocates the node. NULL on error. */
struct Bulletin *readNewBulletin(void)
{
    struct Bulletin *node;
    char buf[LINE_LEN];
    int no;
    float t;

    if (!readInt("  Enter new bulletin number: ", &no))
        return NULL;
    if (no <= 0) {
        printf("  Invalid bulletin number %d: must be positive.\n", no);
        return NULL;
    }
    if (findBulletin(no) != NULL) {
        printf("  Duplicate bulletin number %d: already in the chain.\n", no);
        return NULL;
    }
    if (!readText("  Enter district: ", buf, LINE_LEN))
        return NULL;
    if (!isValidName(buf)) {
        printf("  Invalid district name '%s'.\n", buf);
        return NULL;
    }

    node = (struct Bulletin *)malloc(sizeof(struct Bulletin));
    if (node == NULL) {
        printf("  Memory allocation failed: cannot create bulletin.\n");
        return NULL;
    }
    node->bulletinNo = no;
    strcpy(node->district, buf);
    node->next = NULL;

    if (!readText("  Enter level (GREEN/YELLOW/ORANGE/RED): ", buf, LINE_LEN)) {
        free(node);
        return NULL;
    }
    if (strlen(buf) >= LEVEL_LEN || !normaliseLevel(buf)) {
        printf("  Invalid level '%s': use GREEN, YELLOW, ORANGE or RED.\n", buf);
        free(node);
        return NULL;
    }
    strcpy(node->level, buf);

    if (!readFloat("  Enter Tmax (deg C): ", &t)) {
        free(node);
        return NULL;
    }
    if (t < -10.0f || t > 60.0f) {
        printf("  Invalid Tmax %.1f: must lie between -10 and 60 C.\n", t);
        free(node);
        return NULL;
    }
    node->tmax = t;
    return node;
}

/* Insert at the beginning: new node points to old head and becomes head. */
void insertAtBegin(struct Bulletin *node)
{
    node->next = head;
    head = node;
}

/* Insert node after the node whose number is key. Returns 0 if key not found. */
int insertAfter(int key, struct Bulletin *node)
{
    struct Bulletin *p = findBulletin(key);
    if (p == NULL)
        return 0;
    node->next = p->next;
    p->next = node;
    return 1;
}

/* Result codes for deleteBefore */
#define DEL_OK          1
#define DEL_EMPTY       0
#define DEL_NOT_FOUND  -1
#define DEL_KEY_IS_HEAD -2

/*
 * Delete the node that comes just before the node whose number is key.
 * The removed bulletin is copied into *out before the node is freed.
 */
int deleteBefore(int key, struct Bulletin *out)
{
    struct Bulletin *prev, *victim;

    if (head == NULL)
        return DEL_EMPTY;
    if (head->bulletinNo == key)
        return DEL_KEY_IS_HEAD;             /* nothing exists before head */

    /* key is the 2nd node: the node before it is head itself */
    if (head->next != NULL && head->next->bulletinNo == key) {
        victim = head;
        head = head->next;
        *out = *victim;
        free(victim);
        return DEL_OK;
    }

    /* general case: prev -> victim -> key-node */
    prev = head;
    while (prev->next != NULL && prev->next->next != NULL) {
        if (prev->next->next->bulletinNo == key) {
            victim = prev->next;
            prev->next = victim->next;
            *out = *victim;
            free(victim);
            return DEL_OK;
        }
        prev = prev->next;
    }
    return DEL_NOT_FOUND;
}

void printLine(void)
{
    printf("  +-----+----------+---------------------------+--------+--------+-----------+\n");
}

/* Displays the chain as a table. Last column shows the link to the next node. */
void display(void)
{
    struct Bulletin *p;
    int pos = 1;

    if (head == NULL) {
        printf("  Alert chain is empty (head = NULL).\n");
        return;
    }
    printf("  Alert chain, newest first (%d bulletin(s))\n", countNodes());
    printLine();
    printf("  | Pos | Bulletin | District                  | Level  | Tmax C | Next      |\n");
    printLine();
    for (p = head; p != NULL; p = p->next) {
        printf("  | %3d | %8d | %-25.25s | %-6s | %6.1f | ",
               pos++, p->bulletinNo, p->district, p->level, p->tmax);
        if (p->next != NULL)
            printf("-> %-6d |\n", p->next->bulletinNo);
        else
            printf("NULL      |\n");
    }
    printLine();
    printf("  head -> ");
    for (p = head; p != NULL; p = p->next)
        printf("[%d %s] -> ", p->bulletinNo, p->level);
    printf("NULL\n");
}

void freeList(void)
{
    struct Bulletin *temp;
    while (head != NULL) {
        temp = head;
        head = head->next;
        free(temp);
    }
}

void printMenu(void)
{
    printf("\n========== HEATSYNC Alert Chain (singly linked list) ==========\n");
    printf("1. Insert bulletin at the beginning\n");
    printf("2. Insert bulletin after a specified bulletin\n");
    printf("3. Delete bulletin before a specified bulletin\n");
    printf("4. Display all bulletins (table)\n");
    printf("5. Exit\n");
}

int main(void)
{
    int choice, key, result;
    struct Bulletin *node, removed;

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
            node = readNewBulletin();
            if (node == NULL) {
                printf("  Insert cancelled.\n");
                break;
            }
            insertAtBegin(node);
            printf("  Bulletin %d (%s, %s) inserted at the beginning.\n",
                   node->bulletinNo, node->district, node->level);
            break;

        case 2:
            if (head == NULL) {
                printf("  List is empty: no existing node to insert after. Use option 1.\n");
                break;
            }
            if (!readInt("  Insert after which bulletin number? ", &key))
                break;
            if (findBulletin(key) == NULL) {
                printf("  Not found: bulletin %d is not in the chain.\n", key);
                break;
            }
            node = readNewBulletin();
            if (node == NULL) {
                printf("  Insert cancelled.\n");
                break;
            }
            insertAfter(key, node);
            printf("  Bulletin %d inserted after bulletin %d.\n", node->bulletinNo, key);
            break;

        case 3:
            if (head == NULL) {
                printf("  UNDERFLOW: list is empty, nothing to delete.\n");
                break;
            }
            if (!readInt("  Delete the bulletin before which bulletin number? ", &key))
                break;
            result = deleteBefore(key, &removed);
            if (result == DEL_OK)
                printf("  Deleted bulletin %d (%s, %s, %.1f C) which was before %d.\n",
                       removed.bulletinNo, removed.district, removed.level, removed.tmax, key);
            else if (result == DEL_KEY_IS_HEAD)
                printf("  Cannot delete: bulletin %d is the first node, no node exists before it.%s\n",
                       key, head->next == NULL ? " (list has only 1 node)" : "");
            else if (result == DEL_NOT_FOUND)
                printf("  Not found: bulletin %d is not in the chain.\n", key);
            else
                printf("  UNDERFLOW: list is empty.\n");
            break;

        case 4:
            display();
            break;

        case 5:
            freeList();
            printf("  Alert chain freed. Exiting.\n");
            return 0;

        default:
            printf("  Invalid choice %d. Please enter 1-5.\n", choice);
        }
    }
    freeList();
    return 0;
}
