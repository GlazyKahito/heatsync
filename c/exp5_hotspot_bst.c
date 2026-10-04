/*
 * Experiment 5 : Hotspot Ranking Tree
 *
 * Aim: Write a program for following operations on Binary Search Tree using
 *      Doubly Linked List (DLL): Create empty BST, Insert a new element, Search
 *      for an element, Delete an element, Display all elements.
 *
 * Use-case mapping: HEATSYNC (heatwave response engine for Maharashtra, use
 * case KJS-CES-01) must answer "which districts are hottest right now?" many
 * times a day while district readings keep arriving and being withdrawn. Each
 * district is stored in a BST node that has two links, left and right (the
 * doubly linked node), keyed on its heat score = Tmax in tenths of a degree
 * (44.2 C -> 442), so comparisons stay exact integers. Inorder traversal lists
 * districts from coolest to hottest, reverse inorder gives the hotspot ranking
 * (hottest first) used to prioritise alerts, search finds whether a given
 * temperature has been reported (and by whom), and delete removes a district
 * whose reading is withdrawn. Two districts with exactly the same score are
 * rejected because the key must be unique.
 *
 * Build: gcc -std=c99 -Wall -Wextra -o exp5_hotspot_bst.exe exp5_hotspot_bst.c
 */

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <ctype.h>

#define NAME_LEN 32
#define LINE_LEN 128

struct Node {
    int  heatScore;              /* key: Tmax in tenths of deg C */
    char district[NAME_LEN];
    struct Node *left;           /* smaller scores */
    struct Node *right;          /* larger scores  */
};

struct Node *root = NULL;
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

/* Reads a Tmax (0..60 C) and converts it to a heat score in tenths. */
int readScore(const char *prompt, int *score)
{
    char buf[LINE_LEN];
    float t;
    printf("%s", prompt);
    if (!readLine(buf, LINE_LEN)) return 0;
    if (!parseFloat(buf, &t)) {
        printf("  Invalid input '%s': a temperature such as 43.2 is required.\n", buf);
        return 0;
    }
    if (t < 0.0f || t > 60.0f) {
        printf("  Invalid Tmax %.1f: must be between 0 and 60 C.\n", t);
        return 0;
    }
    *score = (int)(t * 10.0f + 0.5f);       /* round to nearest tenth */
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

/* Prints a score such as 442 as "442 (44.2 C)". */
void printScore(int score)
{
    printf("%d (%d.%d C)", score, score / 10, score % 10);
}

/* ------------------------------------------------------------------ */
/* BST operations                                                       */
/* ------------------------------------------------------------------ */

/*
 * Pseudocode: createNode(key, name)
 *   allocate node N
 *   if allocation fails return NULL
 *   N.key <- key ; N.name <- name
 *   N.left <- NULL ; N.right <- NULL
 *   return N
 */
struct Node *createNode(int key, const char *name)
{
    struct Node *n = (struct Node *)malloc(sizeof(struct Node));
    if (n == NULL)
        return NULL;
    n->heatScore = key;
    strcpy(n->district, name);
    n->left = NULL;
    n->right = NULL;
    return n;
}

/*
 * Pseudocode: freeTree(T)          (postorder release)
 *   if T = NULL return 0
 *   count <- freeTree(T.left) + freeTree(T.right)
 *   free T
 *   return count + 1
 */
int freeTree(struct Node *t)
{
    int count;
    if (t == NULL)
        return 0;
    count = freeTree(t->left) + freeTree(t->right);
    free(t);
    return count + 1;
}

/*
 * Pseudocode: createEmptyBST()
 *   if root != NULL then release every node of the old tree
 *   root <- NULL
 */
void createEmptyBST(void)
{
    int released = freeTree(root);
    root = NULL;
    if (released > 0)
        printf("  Old tree with %d node(s) released.\n", released);
    printf("  Empty BST created (root = NULL).\n");
}

/*
 * Pseudocode: insert(key, name)
 *   if root = NULL : root <- createNode(key, name) ; return INSERTED
 *   cur <- root
 *   loop
 *     if key = cur.key : return DUPLICATE (cur)
 *     if key < cur.key
 *        if cur.left = NULL : cur.left <- createNode(key, name) ; return INSERTED
 *        cur <- cur.left
 *     else
 *        if cur.right = NULL : cur.right <- createNode(key, name) ; return INSERTED
 *        cur <- cur.right
 * Returns 1 inserted, 0 duplicate (*dup set), -1 no memory.
 */
int insert(int key, const char *name, struct Node **dup)
{
    struct Node *cur, *node;

    if (root == NULL) {
        root = createNode(key, name);
        return root == NULL ? -1 : 1;
    }
    cur = root;
    while (1) {
        if (key == cur->heatScore) {
            *dup = cur;
            return 0;
        }
        if (key < cur->heatScore) {
            if (cur->left == NULL) {
                node = createNode(key, name);
                if (node == NULL) return -1;
                cur->left = node;
                return 1;
            }
            cur = cur->left;
        } else {
            if (cur->right == NULL) {
                node = createNode(key, name);
                if (node == NULL) return -1;
                cur->right = node;
                return 1;
            }
            cur = cur->right;
        }
    }
}

/*
 * Pseudocode: search(key)
 *   cur <- root
 *   while cur != NULL
 *     print cur.key                       (path followed)
 *     if key = cur.key return cur
 *     if key < cur.key then cur <- cur.left else cur <- cur.right
 *   return NULL                           (not found)
 */
struct Node *search(int key)
{
    struct Node *cur = root;
    int steps = 0;

    printf("  Search path: ");
    while (cur != NULL) {
        printf("%s%d", steps == 0 ? "" : " -> ", cur->heatScore);
        steps++;
        if (key == cur->heatScore) {
            printf("  (found after %d comparison(s))\n", steps);
            return cur;
        }
        cur = (key < cur->heatScore) ? cur->left : cur->right;
    }
    printf("%sNULL  (not found after %d comparison(s))\n", steps == 0 ? "" : " -> ", steps);
    return NULL;
}

/*
 * Pseudocode: findMin(T)
 *   while T.left != NULL : T <- T.left
 *   return T
 */
struct Node *findMin(struct Node *t)
{
    while (t->left != NULL)
        t = t->left;
    return t;
}

/*
 * Pseudocode: delete(T, key)            returns new root of subtree T
 *   if T = NULL : report not found ; return NULL
 *   if key < T.key : T.left  <- delete(T.left, key)
 *   else if key > T.key : T.right <- delete(T.right, key)
 *   else                                 (T is the node to delete)
 *     case 1, leaf      : free T ; return NULL
 *     case 2, one child : C <- the only child ; free T ; return C
 *     case 3, two children :
 *        S <- findMin(T.right)          (inorder successor)
 *        copy S.key and S.name into T
 *        T.right <- delete(T.right, S.key)
 *   return T
 * caseNo reports which case was used (0 = not found).
 */
struct Node *deleteNode(struct Node *t, int key, int *caseNo, char *removedName)
{
    struct Node *child, *succ;

    if (t == NULL) {
        return NULL;                                   /* key not present */
    }
    if (key < t->heatScore) {
        t->left = deleteNode(t->left, key, caseNo, removedName);
    } else if (key > t->heatScore) {
        t->right = deleteNode(t->right, key, caseNo, removedName);
    } else {
        if (*caseNo == 0) {                            /* remember original target */
            strcpy(removedName, t->district);
        }
        if (t->left == NULL && t->right == NULL) {     /* case 1: leaf */
            if (*caseNo == 0) *caseNo = 1;
            free(t);
            return NULL;
        }
        if (t->left == NULL || t->right == NULL) {     /* case 2: one child */
            if (*caseNo == 0) *caseNo = 2;
            child = (t->left != NULL) ? t->left : t->right;
            free(t);
            return child;
        }
        /* case 3: two children, replace with inorder successor */
        *caseNo = 3;
        succ = findMin(t->right);
        printf("  Inorder successor of %d is %d (%s); it replaces the deleted node.\n",
               t->heatScore, succ->heatScore, succ->district);
        t->heatScore = succ->heatScore;
        strcpy(t->district, succ->district);
        t->right = deleteNode(t->right, succ->heatScore, caseNo, removedName);
    }
    return t;
}

/*
 * Pseudocode: inorder(T)        (Left, Node, Right -> ascending scores)
 *   if T != NULL : inorder(T.left) ; visit T ; inorder(T.right)
 */
void inorder(struct Node *t)
{
    if (t == NULL)
        return;
    inorder(t->left);
    printf("    %-27s ", t->district);
    printScore(t->heatScore);
    printf("\n");
    inorder(t->right);
}

/*
 * Pseudocode: reverseInorder(T, rank)   (Right, Node, Left -> hottest first)
 *   if T != NULL
 *     reverseInorder(T.right, rank)
 *     rank <- rank + 1 ; visit T with rank
 *     reverseInorder(T.left, rank)
 */
void reverseInorder(struct Node *t, int *rank)
{
    if (t == NULL)
        return;
    reverseInorder(t->right, rank);
    (*rank)++;
    printf("    #%-2d %-27s ", *rank, t->district);
    printScore(t->heatScore);
    printf("%s\n", t->heatScore >= 450 ? "  >=45 C" : (t->heatScore >= 400 ? "  >=40 C" : ""));
    reverseInorder(t->left, rank);
}

/*
 * Pseudocode: preorder(T)       (Node, Left, Right -> shows tree shape)
 *   if T != NULL : visit T ; preorder(T.left) ; preorder(T.right)
 */
void preorder(struct Node *t)
{
    if (t == NULL)
        return;
    printf("%d ", t->heatScore);
    preorder(t->left);
    preorder(t->right);
}

/*
 * Pseudocode: height(T)         (number of levels; empty tree = 0)
 *   if T = NULL return 0
 *   return 1 + max(height(T.left), height(T.right))
 */
int height(struct Node *t)
{
    int hl, hr;
    if (t == NULL)
        return 0;
    hl = height(t->left);
    hr = height(t->right);
    return 1 + (hl > hr ? hl : hr);
}

/*
 * Pseudocode: countNodes(T)
 *   if T = NULL return 0
 *   return 1 + countNodes(T.left) + countNodes(T.right)
 */
int countNodes(struct Node *t)
{
    if (t == NULL)
        return 0;
    return 1 + countNodes(t->left) + countNodes(t->right);
}

/*
 * Pseudocode: printSideways(T, depth)   (tree rotated 90 degrees, right on top)
 *   if T != NULL
 *     printSideways(T.right, depth + 1)
 *     print 4*depth spaces, then T.key
 *     printSideways(T.left, depth + 1)
 */
void printSideways(struct Node *t, int depth)
{
    int i;
    if (t == NULL)
        return;
    printSideways(t->right, depth + 1);
    printf("    ");
    for (i = 0; i < depth; i++)
        printf("      ");
    printf("%d %s\n", t->heatScore, t->district);
    printSideways(t->left, depth + 1);
}

/*
 * Pseudocode: displayAll()
 *   if root = NULL : print "tree empty" ; return
 *   print inorder, reverse inorder (ranking), preorder, height, node count
 */
void displayAll(void)
{
    int rank = 0;
    if (root == NULL) {
        printf("  BST is empty. Nothing to display.\n");
        return;
    }
    printf("  Inorder (coolest -> hottest):\n");
    inorder(root);
    printf("  Reverse inorder = HOTSPOT RANKING (hottest first):\n");
    reverseInorder(root, &rank);
    printf("  Preorder (keys): ");
    preorder(root);
    printf("\n  Nodes = %d, Height = %d level(s)\n", countNodes(root), height(root));
    printf("  Tree shape (rotated; right subtree above, left below):\n");
    printSideways(root, 0);
}

void printMenu(void)
{
    printf("\n======= HEATSYNC Hotspot BST (key = Tmax in tenths of C) =======\n");
    printf("1. Create empty BST\n");
    printf("2. Insert district reading\n");
    printf("3. Search by Tmax\n");
    printf("4. Delete by Tmax\n");
    printf("5. Display all elements\n");
    printf("6. Exit\n");
}

int main(void)
{
    int choice, key, status, caseNo;
    char name[LINE_LEN], removedName[NAME_LEN];
    struct Node *found, *dup = NULL;

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
            createEmptyBST();
            break;

        case 2:
            printf("  Enter district name: ");
            if (!readLine(name, LINE_LEN))
                break;
            trim(name);
            if (!isValidName(name)) {
                printf("  Invalid district name '%s'.\n", name);
                break;
            }
            if (!readScore("  Enter Tmax (deg C): ", &key))
                break;
            status = insert(key, name, &dup);
            if (status == 1) {
                printf("  Inserted %s with heat score ", name);
                printScore(key);
                printf(".\n");
            } else if (status == 0) {
                printf("  Duplicate key: heat score %d already belongs to %s. Not inserted.\n",
                       key, dup->district);
            } else {
                printf("  Memory allocation failed.\n");
            }
            break;

        case 3:
            if (root == NULL) {
                printf("  BST is empty. Nothing to search.\n");
                break;
            }
            if (!readScore("  Enter Tmax to search (deg C): ", &key))
                break;
            found = search(key);
            if (found != NULL) {
                printf("  Found: %s with heat score ", found->district);
                printScore(found->heatScore);
                printf("\n");
            } else {
                printf("  Not found: no district with heat score %d.\n", key);
            }
            break;

        case 4:
            if (root == NULL) {
                printf("  UNDERFLOW: BST is empty, nothing to delete.\n");
                break;
            }
            if (!readScore("  Enter Tmax to delete (deg C): ", &key))
                break;
            caseNo = 0;
            root = deleteNode(root, key, &caseNo, removedName);
            if (caseNo == 0)
                printf("  Not found: no district with heat score %d.\n", key);
            else
                printf("  Deleted %s (score %d) - case %d: %s.\n", removedName, key, caseNo,
                       caseNo == 1 ? "leaf node" :
                       caseNo == 2 ? "node with one child" : "node with two children");
            break;

        case 5:
            displayAll();
            break;

        case 6:
            freeTree(root);
            root = NULL;
            printf("  Tree released. Exiting.\n");
            return 0;

        default:
            printf("  Invalid choice %d. Please enter 1-6.\n", choice);
        }
    }
    freeTree(root);
    return 0;
}
