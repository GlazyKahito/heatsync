/*
 * Experiment 6 : Heat Spread over the District Graph (BFS)
 *
 * Aim: Implement a menu driven program to represent a graph and traverse it
 *      using BFS technique. Implement the static linear queue ADT, represent
 *      the graph using adjacency matrix.
 *
 * Use-case mapping: HEATSYNC (heatwave response engine for Maharashtra, use
 * case KJS-CES-01) treats the 36 districts of Maharashtra as the vertices of a
 * graph, with an edge wherever two districts share a real border (77 edges,
 * stored in a 36 x 36 adjacency matrix). A heatwave is a regional event: when
 * one district crosses the threshold its neighbours are the next to be warned.
 * Breadth First Search from the affected district, driven by a static linear
 * queue, produces exactly these warning rings: level 1 = bordering districts
 * (first alert ring), level 2 = their neighbours, and so on. The same BFS,
 * restricted to districts whose Tmax was >= 40 C on 2024-05-28 (ERA5
 * reanalysis), finds the connected heatwave cluster a district belongs to, and
 * an unrestricted BFS finds the nearest district below 40 C (fewest border
 * crossings), which is useful for planning cooling relief and resources.
 *
 * Data: district list and adjacency from the HEATSYNC district file
 *       (boundaries: geoBoundaries, ODbL); Tmax for 2024-05-28 from ERA5
 *       reanalysis via Open-Meteo (CC BY 4.0).
 *
 * Build: gcc -std=c99 -Wall -Wextra -o exp6_heat_spread_bfs.exe exp6_heat_spread_bfs.c
 */

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <ctype.h>

#define N        36         /* number of districts (vertices) */
#define QMAX     N          /* each vertex enters the BFS queue at most once */
#define LINE_LEN 128
#define HOT_LIMIT 40.0f     /* IMD plains threshold for Tmax, deg C */

const char *districtName[N] = {
    "Mumbai City", "Mumbai Suburban", "Palghar", "Raigad",
    "Thane", "Ratnagiri", "Sindhudurg", "Pune",
    "Nashik", "Kolhapur", "Satara", "Nandurbar",
    "Dhule", "Ahilyanagar", "Sangli", "Solapur",
    "Jalgaon", "Chhatrapati Sambhajinagar", "Beed", "Jalna",
    "Dharashiv", "Parbhani", "Latur", "Hingoli",
    "Nanded", "Buldhana", "Akola", "Washim",
    "Amravati", "Yavatmal", "Wardha", "Nagpur",
    "Chandrapur", "Bhandara", "Gondia", "Gadchiroli",
};

/* KON = Konkan, MMH = Madhya Maharashtra, MWD = Marathwada, VID = Vidarbha */
const char *subdivision[N] = {
    "KON", "KON", "KON", "KON", "KON", "KON", "KON", "MMH", "MMH",
    "MMH", "MMH", "MMH", "MMH", "MMH", "MMH", "MMH", "MMH", "MWD",
    "MWD", "MWD", "MWD", "MWD", "MWD", "MWD", "MWD", "VID", "VID",
    "VID", "VID", "VID", "VID", "VID", "VID", "VID", "VID", "VID",
};

/* Daily maximum temperature on 2024-05-28 (ERA5), indexed by district id */
const float tmax28May[N] = {
    33.6f, 34.8f, 34.5f, 33.7f, 36.8f, 34.0f,
    33.8f, 34.5f, 36.3f, 30.5f, 33.4f, 40.1f,
    39.9f, 36.9f, 34.0f, 38.7f, 43.2f, 40.5f,
    42.1f, 41.5f, 39.0f, 42.8f, 40.5f, 42.4f,
    43.2f, 41.5f, 43.4f, 40.1f, 43.2f, 42.4f,
    42.4f, 44.2f, 43.2f, 42.1f, 41.4f, 41.5f,
};

/* Shared district borders (undirected edges) */
#define EDGES 77
const int edgeList[EDGES][2] = {
    {0, 1}, {1, 4}, {2, 4}, {2, 8}, {3, 4}, {3, 5}, {3, 7}, {3, 10},
    {4, 7}, {4, 8}, {4, 13}, {5, 6}, {5, 9}, {5, 10}, {5, 14}, {6, 9},
    {7, 10}, {7, 13}, {7, 15}, {8, 12}, {8, 13}, {8, 16}, {8, 17}, {9, 14},
    {10, 14}, {10, 15}, {11, 12}, {12, 16}, {13, 15}, {13, 17}, {13, 18}, {13, 20},
    {14, 15}, {15, 20}, {16, 17}, {16, 19}, {16, 25}, {17, 18}, {17, 19}, {18, 19},
    {18, 20}, {18, 21}, {18, 22}, {19, 21}, {19, 23}, {19, 25}, {20, 22}, {21, 22},
    {21, 23}, {21, 24}, {22, 24}, {23, 24}, {23, 25}, {23, 27}, {23, 29}, {24, 29},
    {25, 26}, {25, 27}, {25, 28}, {26, 27}, {26, 28}, {27, 28}, {27, 29}, {28, 29},
    {28, 30}, {28, 31}, {29, 30}, {29, 32}, {30, 31}, {30, 32}, {31, 32}, {31, 33},
    {32, 33}, {32, 35}, {33, 34}, {33, 35}, {34, 35},
};

int adj[N][N];          /* adjacency matrix: adj[i][j] = 1 if i and j share a border */
int inputEnded = 0;

/* ------------------------------------------------------------------ */
/* Static linear queue ADT                                              */
/*   front = index of first element, rear = index of last element       */
/*   empty when front > rear, full when rear == QMAX - 1                */
/* ------------------------------------------------------------------ */

struct LinearQueue {
    int items[QMAX];
    int front;
    int rear;
};

void initQueue(struct LinearQueue *q)
{
    q->front = 0;
    q->rear = -1;
}

int isQueueEmpty(const struct LinearQueue *q) { return q->front > q->rear; }
int isQueueFull(const struct LinearQueue *q)  { return q->rear == QMAX - 1; }

/* Returns 0 on overflow. */
int enqueue(struct LinearQueue *q, int v)
{
    if (isQueueFull(q)) {
        printf("  Queue OVERFLOW: rear = %d = MAX-1, cannot enqueue %s.\n", q->rear, districtName[v]);
        return 0;
    }
    q->items[++q->rear] = v;
    return 1;
}

/* Returns -1 on underflow. */
int dequeue(struct LinearQueue *q)
{
    if (isQueueEmpty(q)) {
        printf("  Queue UNDERFLOW: queue is empty, nothing to dequeue.\n");
        return -1;
    }
    return q->items[q->front++];
}

void displayQueue(const struct LinearQueue *q)
{
    int i;
    printf("  front = %d, rear = %d, size = %d / %d\n",
           q->front, q->rear, q->rear - q->front + 1, QMAX);
    if (isQueueEmpty(q)) {
        printf("  Queue is empty.\n");
        return;
    }
    printf("  Queue (front -> rear): ");
    for (i = q->front; i <= q->rear; i++)
        printf("%d ", q->items[i]);
    printf("\n");
}

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

/* Reads a district as an id (0-35) or a name. Returns the id or -1. */
int readDistrict(const char *prompt)
{
    char buf[LINE_LEN];
    int id, i;

    printf("%s", prompt);
    if (!readLine(buf, LINE_LEN))
        return -1;
    trim(buf);
    if (buf[0] == '\0') {
        printf("  Invalid vertex: empty input.\n");
        return -1;
    }
    if (parseInt(buf, &id)) {
        if (id < 0 || id >= N) {
            printf("  Invalid vertex %d: district id must be 0-%d.\n", id, N - 1);
            return -1;
        }
        return id;
    }
    for (i = 0; i < N; i++)
        if (equalsIgnoreCase(buf, districtName[i]))
            return i;
    printf("  Invalid vertex: '%s' is not a Maharashtra district in this graph.\n", buf);
    return -1;
}

/* ------------------------------------------------------------------ */
/* Graph                                                                */
/* ------------------------------------------------------------------ */

/* Builds the adjacency matrix from the edge list (undirected graph). */
void initGraph(void)
{
    int i, j, e;
    for (i = 0; i < N; i++)
        for (j = 0; j < N; j++)
            adj[i][j] = 0;
    for (e = 0; e < EDGES; e++) {
        adj[edgeList[e][0]][edgeList[e][1]] = 1;
        adj[edgeList[e][1]][edgeList[e][0]] = 1;
    }
}

int degree(int v)
{
    int j, d = 0;
    for (j = 0; j < N; j++)
        d += adj[v][j];
    return d;
}

int isHot(int v) { return tmax28May[v] >= HOT_LIMIT; }

void listDistricts(void)
{
    int i;
    printf("  Id  District                   Sub  Tmax 28-May  Degree\n");
    printf("  --  -------------------------  ---  -----------  ------\n");
    for (i = 0; i < N; i++)
        printf("  %2d  %-25s  %s  %6.1f %s    %d\n", i, districtName[i], subdivision[i],
               tmax28May[i], isHot(i) ? "HOT" : "   ", degree(i));
    printf("  (HOT = Tmax >= %.0f C)\n", HOT_LIMIT);
}

/* Prints the 36 x 36 matrix compactly: '1' = edge, '.' = no edge. */
void displayMatrix(void)
{
    int i, j;
    printf("  Adjacency matrix (%d x %d, %d edges). Column ids read top-down.\n", N, N, EDGES);
    printf("                      ");
    for (j = 0; j < N; j++)
        printf("%d", j / 10);
    printf("\n                      ");
    for (j = 0; j < N; j++)
        printf("%d", j % 10);
    printf("\n");
    for (i = 0; i < N; i++) {
        printf("  %2d %-16.16s  ", i, districtName[i]);
        for (j = 0; j < N; j++)
            printf("%c", adj[i][j] ? '1' : '.');
        printf("  deg %d\n", degree(i));
    }
}

void displayRow(int v)
{
    int j;
    printf("  Row %d (%s) of the adjacency matrix:\n  ", v, districtName[v]);
    for (j = 0; j < N; j++)
        printf("%d", adj[v][j]);
    printf("\n  Neighbours (degree %d):\n", degree(v));
    for (j = 0; j < N; j++)
        if (adj[v][j])
            printf("    %2d %-25s Tmax %.1f C\n", j, districtName[j], tmax28May[j]);
}

/*
 * Breadth First Search from start. If hotOnly is 1 only districts with
 * Tmax >= 40 C are entered. Fills level[] (-1 = not reached), parent[] and
 * order[] (visit order). Returns number of districts visited.
 * When verbose is 1 every dequeue step is printed.
 */
int bfs(int start, int hotOnly, int level[], int parent[], int order[], int verbose)
{
    struct LinearQueue q;
    int visited[N], v, w, count = 0, step = 0, added;

    for (v = 0; v < N; v++) {
        visited[v] = 0;
        level[v] = -1;
        parent[v] = -1;
    }
    initQueue(&q);
    visited[start] = 1;
    level[start] = 0;
    enqueue(&q, start);

    if (verbose) {
        printf("  Step | Dequeued (level)               | Enqueued neighbours\n");
        printf("  -----+--------------------------------+----------------------------\n");
    }
    while (!isQueueEmpty(&q)) {
        v = dequeue(&q);
        order[count++] = v;
        if (verbose)
            printf("  %4d | %2d %-22.22s (%d) | ", ++step, v, districtName[v], level[v]);
        added = 0;
        for (w = 0; w < N; w++) {
            if (adj[v][w] && !visited[w] && (!hotOnly || isHot(w))) {
                visited[w] = 1;
                level[w] = level[v] + 1;
                parent[w] = v;
                if (!enqueue(&q, w))
                    return count;
                if (verbose)
                    printf("%d ", w);
                added++;
            }
        }
        if (verbose)
            printf("%s\n", added ? "" : "-");
    }
    return count;
}

/* Option 4: full BFS with alert rings. */
void bfsTraversal(int start)
{
    int level[N], parent[N], order[N], count, i, L, maxLevel = 0, first;

    printf("  BFS from %s (id %d), Tmax %.1f C on 2024-05-28\n",
           districtName[start], start, tmax28May[start]);
    count = bfs(start, 0, level, parent, order, 1);

    printf("\n  Visit order: ");
    for (i = 0; i < count; i++)
        printf("%s%s", districtName[order[i]], i < count - 1 ? " -> " : "\n");

    for (i = 0; i < count; i++)
        if (level[order[i]] > maxLevel)
            maxLevel = level[order[i]];
    printf("\n  Alert rings (BFS level = number of border crossings):\n");
    for (L = 0; L <= maxLevel; L++) {
        printf("    Level %d%s: ", L,
               L == 0 ? " (source)          " : (L == 1 ? " (first alert ring)" : "                   "));
        first = 1;
        for (i = 0; i < count; i++) {
            if (level[order[i]] == L) {
                printf("%s%s", first ? "" : ", ", districtName[order[i]]);
                first = 0;
            }
        }
        printf("\n");
    }
    printf("  Visited %d of %d districts; farthest ring = level %d.\n", count, N, maxLevel);
}

/* Option 5: connected cluster of districts with Tmax >= 40 C. */
void heatCluster(int start)
{
    int level[N], parent[N], order[N], count, i, hottest;

    if (!isHot(start)) {
        printf("  %s had Tmax %.1f C on 2024-05-28 (< %.0f C): it is not part of a heatwave cluster.\n",
               districtName[start], tmax28May[start], HOT_LIMIT);
        return;
    }
    printf("  BFS restricted to districts with Tmax >= %.0f C on 2024-05-28:\n", HOT_LIMIT);
    count = bfs(start, 1, level, parent, order, 1);
    hottest = order[0];
    printf("\n  Heatwave cluster containing %s: %d district(s)\n", districtName[start], count);
    for (i = 0; i < count; i++) {
        printf("    %2d %-25s %.1f C  (hop %d)\n", order[i], districtName[order[i]],
               tmax28May[order[i]], level[order[i]]);
        if (tmax28May[order[i]] > tmax28May[hottest])
            hottest = order[i];
    }
    printf("  Hottest in cluster: %s (%.1f C)\n", districtName[hottest], tmax28May[hottest]);
    if (count == 1)
        printf("  Isolated hotspot: no bordering district reached %.0f C.\n", HOT_LIMIT);
}

/* Option 6: nearest district (fewest hops) with Tmax below 40 C. */
void nearestCool(int start)
{
    int level[N], parent[N], order[N], count, i, best = -1, path[N], len, v;

    if (!isHot(start)) {
        printf("  %s itself was below %.0f C (%.1f C) on 2024-05-28: distance 0.\n",
               districtName[start], HOT_LIMIT, tmax28May[start]);
        return;
    }
    count = bfs(start, 0, level, parent, order, 0);
    for (i = 0; i < count; i++) {            /* BFS order = increasing distance */
        if (!isHot(order[i])) {
            best = order[i];
            break;
        }
    }
    if (best == -1) {
        printf("  No district below %.0f C is reachable from %s.\n", HOT_LIMIT, districtName[start]);
        return;
    }

    len = 0;
    for (v = best; v != -1; v = parent[v])
        path[len++] = v;
    printf("  Nearest district below %.0f C from %s: %s (%.1f C), %d hop(s)\n",
           HOT_LIMIT, districtName[start], districtName[best], tmax28May[best], level[best]);
    printf("  Path: ");
    for (i = len - 1; i >= 0; i--)
        printf("%s (%.1f)%s", districtName[path[i]], tmax28May[path[i]], i > 0 ? " -> " : "\n");

    printf("  All districts below %.0f C at the same distance: ", HOT_LIMIT);
    for (i = 0; i < count; i++)
        if (level[order[i]] == level[best] && !isHot(order[i]))
            printf("%s (%.1f)  ", districtName[order[i]], tmax28May[order[i]]);
    printf("\n");
}

/* Option 7: exercise the static linear queue ADT on its own. */
void queueTest(void)
{
    struct LinearQueue q;
    int choice, v, added;

    initQueue(&q);
    while (1) {
        printf("\n  --- Static linear queue ADT test (MAX = %d) ---\n", QMAX);
        printf("  1. Enqueue a district   2. Dequeue   3. Display\n");
        printf("  4. Fill queue to MAX and try one more   5. Back to main menu\n");
        if (!readInt("  Enter your choice: ", &choice)) {
            if (inputEnded) return;
            continue;
        }
        switch (choice) {
        case 1:
            if (isQueueFull(&q)) {
                printf("  Queue OVERFLOW: rear = %d = MAX-1.\n", q.rear);
                if (q.front > 0)
                    printf("  (%d slot(s) before front are free, but a linear queue cannot reuse them.)\n",
                           q.front);
                break;
            }
            v = readDistrict("  District id or name: ");
            if (v >= 0 && enqueue(&q, v))
                printf("  Enqueued %d (%s) at index %d.\n", v, districtName[v], q.rear);
            break;
        case 2:
            v = dequeue(&q);
            if (v >= 0)
                printf("  Dequeued %d (%s). front is now %d.\n", v, districtName[v], q.front);
            break;
        case 3:
            displayQueue(&q);
            break;
        case 4:
            added = 0;
            v = 0;
            while (!isQueueFull(&q)) {
                enqueue(&q, v);
                v = (v + 1) % N;
                added++;
            }
            printf("  Enqueued %d more district id(s); rear = %d.\n", added, q.rear);
            printf("  Trying one more enqueue:\n");
            enqueue(&q, v);
            if (q.front > 0)
                printf("  Note: %d slot(s) at the front are free but unusable - a linear queue\n"
                       "  never reuses them (the circular queue of Experiment 4 does).\n", q.front);
            break;
        case 5:
            return;
        default:
            printf("  Invalid choice %d. Please enter 1-5.\n", choice);
        }
    }
}

void printMenu(void)
{
    printf("\n===== HEATSYNC Heat Spread (graph + BFS, %d districts) =====\n", N);
    printf("1. List districts (id, Tmax on 2024-05-28)\n");
    printf("2. Display full adjacency matrix\n");
    printf("3. Display adjacency row of one district\n");
    printf("4. BFS traversal / alert rings from a district\n");
    printf("5. Heatwave cluster containing a district (Tmax >= 40 C)\n");
    printf("6. Nearest district below 40 C (fewest hops)\n");
    printf("7. Static linear queue ADT test\n");
    printf("8. Exit\n");
}

int main(void)
{
    int choice, v;

    initGraph();
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
            listDistricts();
            break;
        case 2:
            displayMatrix();
            break;
        case 3:
            v = readDistrict("  District id or name: ");
            if (v >= 0)
                displayRow(v);
            break;
        case 4:
            v = readDistrict("  Start district id or name: ");
            if (v >= 0)
                bfsTraversal(v);
            break;
        case 5:
            v = readDistrict("  District id or name: ");
            if (v >= 0)
                heatCluster(v);
            break;
        case 6:
            v = readDistrict("  Start district id or name: ");
            if (v >= 0)
                nearestCool(v);
            break;
        case 7:
            queueTest();
            break;
        case 8:
            printf("  Exiting heat spread module.\n");
            return 0;
        default:
            printf("  Invalid choice %d. Please enter 1-8.\n", choice);
        }
    }
    return 0;
}
