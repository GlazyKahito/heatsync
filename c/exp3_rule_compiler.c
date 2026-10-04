/*
 * Experiment 3 : Heatwave Rule Compiler
 *
 * Aim: WAP to create a stack using SLL (create stack, insert/push, delete/pop,
 *      display top/peek) and WAP to convert an INFIX expression to POSTFIX.
 *
 * Use-case mapping: HEATSYNC (heatwave response engine for Maharashtra, use
 * case KJS-CES-01) lets a district officer type a warning rule the way IMD
 * writes its criteria, for example  T>39&D>4|T>44  ("Tmax above 39 C and
 * departure above 4 C, or Tmax above 44 C"). Humans write such rules in infix
 * form, but a machine evaluates them most simply in postfix form. This program
 * builds a dynamic stack on a singly linked list (push = insert at beginning,
 * pop = delete from beginning), uses it to convert the infix rule to postfix
 * while printing every step, and then evaluates the postfix rule with a second
 * stack of numbers for the station values T (Tmax), D (departure from normal),
 * H (humidity) and F (feels-like temperature). The result tells the officer
 * whether the rule fires and an alert should be raised. Malformed rules (for
 * example mismatched brackets) are rejected before they can reach the field.
 *
 * Operators, highest precedence first:  * /   then  + -   then  > <
 * then  & (AND)  then  | (OR). All are left associative.
 *
 * Build: gcc -std=c99 -Wall -Wextra -o exp3_rule_compiler.exe exp3_rule_compiler.c
 */

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <ctype.h>

#define LINE_LEN    256
#define MAX_EXPR    100     /* longest rule accepted */
#define POSTFIX_LEN 256
#define MAX_TOKEN   16

int inputEnded = 0;

/* ------------------------------------------------------------------ */
/* Character stack implemented with a singly linked list                */
/* ------------------------------------------------------------------ */

struct StackNode {
    char data;
    struct StackNode *next;
};

struct StackNode *top = NULL;      /* top of stack = head of the SLL */

/* Create stack: release any old nodes and start with an empty list. */
void createStack(void)
{
    struct StackNode *temp;
    while (top != NULL) {
        temp = top;
        top = top->next;
        free(temp);
    }
    top = NULL;
}

int isEmpty(void)
{
    return top == NULL;
}

/* Push = SLL insert at the beginning. */
void push(char x)
{
    struct StackNode *node = (struct StackNode *)malloc(sizeof(struct StackNode));
    if (node == NULL) {
        printf("  Stack overflow: no memory for a new node.\n");
        return;
    }
    node->data = x;
    node->next = top;
    top = node;
}

/* Pop = SLL delete from the beginning. Returns '\0' on underflow. */
char pop(void)
{
    struct StackNode *temp;
    char x;
    if (isEmpty()) {
        printf("  Stack underflow: stack is empty.\n");
        return '\0';
    }
    temp = top;
    x = temp->data;
    top = top->next;
    free(temp);
    return x;
}

/* Peek: returns the top element without removing it ('\0' if empty). */
char peek(void)
{
    if (isEmpty())
        return '\0';
    return top->data;
}

int stackSize(void)
{
    int n = 0;
    struct StackNode *p;
    for (p = top; p != NULL; p = p->next)
        n++;
    return n;
}

/* Writes the stack contents bottom-to-top into buf (used in step tables). */
void stackToString(char *buf, int size)
{
    char temp[LINE_LEN];
    int n = 0, i;
    struct StackNode *p;

    for (p = top; p != NULL && n < LINE_LEN - 1; p = p->next)
        temp[n++] = p->data;            /* collected top-to-bottom */
    if (n == 0) {
        strcpy(buf, "(empty)");
        return;
    }
    for (i = 0; i < n && i < size - 1; i++)
        buf[i] = temp[n - 1 - i];       /* reverse: bottom first */
    buf[i] = '\0';
}

/* Vertical display of the stack, top first. */
void displayStack(void)
{
    struct StackNode *p;
    if (isEmpty()) {
        printf("  Stack is empty (top = NULL).\n");
        return;
    }
    printf("  Stack contents (%d element(s)):\n", stackSize());
    for (p = top; p != NULL; p = p->next)
        printf("      | %c |%s\n", p->data, p == top ? "  <- top" : "");
    printf("      +---+\n");
}

/* ------------------------------------------------------------------ */
/* Value stack (float) for postfix evaluation, also a linked list       */
/* ------------------------------------------------------------------ */

struct ValNode {
    float value;
    struct ValNode *next;
};

struct ValNode *valTop = NULL;

int pushVal(float v)
{
    struct ValNode *node = (struct ValNode *)malloc(sizeof(struct ValNode));
    if (node == NULL) {
        printf("  Value stack overflow: no memory.\n");
        return 0;
    }
    node->value = v;
    node->next = valTop;
    valTop = node;
    return 1;
}

int popVal(float *v)
{
    struct ValNode *temp;
    if (valTop == NULL)
        return 0;                       /* underflow */
    temp = valTop;
    *v = temp->value;
    valTop = temp->next;
    free(temp);
    return 1;
}

void clearVal(void)
{
    float dummy;
    while (popVal(&dummy))
        ;
}

/* Prints the value stack bottom-to-top. */
void printValStack(void)
{
    float vals[MAX_EXPR];
    int n = 0, i;
    struct ValNode *p;
    for (p = valTop; p != NULL && n < MAX_EXPR; p = p->next)
        vals[n++] = p->value;
    if (n == 0) {
        printf("(empty)");
        return;
    }
    for (i = n - 1; i >= 0; i--)
        printf("%g ", vals[i]);
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
        printf("  Invalid input '%s': a number is required.\n", buf);
        return 0;
    }
    return 1;
}

/* ------------------------------------------------------------------ */
/* Infix to postfix conversion                                          */
/* ------------------------------------------------------------------ */

int precedence(char op)
{
    switch (op) {
    case '*': case '/': return 5;
    case '+': case '-': return 4;
    case '>': case '<': return 3;
    case '&':           return 2;
    case '|':           return 1;
    default:            return 0;   /* not an operator */
    }
}

int isVariable(char c)
{
    return c == 'T' || c == 'D' || c == 'H' || c == 'F';
}

/* Appends one token followed by a space to postfix. */
void appendToken(char *postfix, int *j, const char *token)
{
    int k;
    for (k = 0; token[k] != '\0' && *j < POSTFIX_LEN - 2; k++)
        postfix[(*j)++] = token[k];
    postfix[(*j)++] = ' ';
    postfix[*j] = '\0';
}

void appendChar(char *postfix, int *j, char c)
{
    char token[2];
    token[0] = c;
    token[1] = '\0';
    appendToken(postfix, j, token);
}

void printStep(const char *symbol, const char *postfix)
{
    char stackText[LINE_LEN];
    stackToString(stackText, LINE_LEN);
    printf("  | %-7s | %-14s | %-40s |\n", symbol, stackText, postfix);
}

/* Prints an error, clears the operator stack and returns 0. */
int conversionError(const char *message, int position)
{
    printf("  +---------+----------------+------------------------------------------+\n");
    if (position >= 0)
        printf("  ERROR at position %d: %s\n", position + 1, message);
    else
        printf("  ERROR: %s\n", message);
    printf("  Rule rejected.\n");
    createStack();
    return 0;
}

/*
 * Converts infix to postfix using the SLL stack. Tokens in postfix are
 * separated by spaces so multi-digit numbers stay intact.
 * expectOperand tracks the grammar: 1 means an operand or '(' must come next.
 */
int infixToPostfix(const char *infix, char *postfix)
{
    int i = 0, j = 0, k, expectOperand = 1, tokens = 0;
    char sym, token[MAX_TOKEN], msg[80];

    createStack();
    postfix[0] = '\0';
    printf("  +---------+----------------+------------------------------------------+\n");
    printf("  | Symbol  | Stack (bottom) | Postfix                                  |\n");
    printf("  +---------+----------------+------------------------------------------+\n");

    while (infix[i] != '\0') {
        sym = infix[i];
        if (isspace((unsigned char)sym)) {
            i++;
            continue;
        }
        tokens++;

        if (isdigit((unsigned char)sym)) {                 /* number operand */
            if (!expectOperand)
                return conversionError("missing operator before number", i);
            k = 0;
            while (isdigit((unsigned char)infix[i])) {
                if (k >= MAX_TOKEN - 1)
                    return conversionError("number is too long", i);
                token[k++] = infix[i++];
            }
            token[k] = '\0';
            appendToken(postfix, &j, token);
            expectOperand = 0;
            printStep(token, postfix);
            continue;
        }

        if (isalpha((unsigned char)sym)) {                 /* variable operand */
            sym = (char)toupper((unsigned char)sym);
            if (!isVariable(sym)) {
                sprintf(msg, "unknown variable '%c' (use T, D, H or F)", infix[i]);
                return conversionError(msg, i);
            }
            if (!expectOperand)
                return conversionError("two operands without an operator between them", i);
            appendChar(postfix, &j, sym);
            expectOperand = 0;
            token[0] = sym;
            token[1] = '\0';
        } else if (sym == '(') {
            if (!expectOperand)
                return conversionError("missing operator before '('", i);
            push('(');
            strcpy(token, "(");
        } else if (sym == ')') {
            if (expectOperand)
                return conversionError("empty brackets or operator before ')'", i);
            while (!isEmpty() && peek() != '(')
                appendChar(postfix, &j, pop());
            if (isEmpty())
                return conversionError("mismatched parentheses: ')' has no matching '('", i);
            pop();                                          /* discard '(' */
            strcpy(token, ")");
        } else if (precedence(sym) > 0) {                  /* operator */
            if (expectOperand) {
                sprintf(msg, "operator '%c' has no left operand", sym);
                return conversionError(msg, i);
            }
            /* pop operators of higher or equal precedence (left associative) */
            while (!isEmpty() && peek() != '(' && precedence(peek()) >= precedence(sym))
                appendChar(postfix, &j, pop());
            push(sym);
            expectOperand = 1;
            token[0] = sym;
            token[1] = '\0';
        } else {
            sprintf(msg, "invalid symbol '%c'", sym);
            return conversionError(msg, i);
        }
        printStep(token, postfix);
        i++;
    }

    if (tokens == 0)
        return conversionError("empty rule", -1);
    if (expectOperand)
        return conversionError("rule ends with an operator (missing right operand)", -1);

    /* pop whatever operators remain */
    while (!isEmpty()) {
        sym = pop();
        if (sym == '(')
            return conversionError("mismatched parentheses: '(' is never closed", -1);
        appendChar(postfix, &j, sym);
    }
    printStep("(end)", postfix);
    printf("  +---------+----------------+------------------------------------------+\n");

    if (j > 0 && postfix[j - 1] == ' ')
        postfix[j - 1] = '\0';                              /* drop last space */
    return 1;
}

/* ------------------------------------------------------------------ */
/* Postfix evaluation                                                   */
/* ------------------------------------------------------------------ */

/* Applies one operator. Returns 0 on division by zero. */
int applyOperator(char op, float a, float b, float *result)
{
    switch (op) {
    case '*': *result = a * b; break;
    case '/':
        if (b == 0.0f) return 0;
        *result = a / b;
        break;
    case '+': *result = a + b; break;
    case '-': *result = a - b; break;
    case '>': *result = (a > b) ? 1.0f : 0.0f; break;
    case '<': *result = (a < b) ? 1.0f : 0.0f; break;
    case '&': *result = (a != 0.0f && b != 0.0f) ? 1.0f : 0.0f; break;
    case '|': *result = (a != 0.0f || b != 0.0f) ? 1.0f : 0.0f; break;
    default:  *result = 0.0f;
    }
    return 1;
}

/* Evaluates a space separated postfix rule. Returns 0 on error. */
int evaluatePostfix(const char *postfix, float T, float D, float H, float F, float *answer)
{
    char token[MAX_TOKEN], action[96];
    int i = 0, k;
    float a, b, r, v;

    clearVal();
    printf("  %-7s | %-34s | Value stack (bottom..top)\n", "Token", "Action");
    printf("  --------+------------------------------------+---------------------------\n");
    while (postfix[i] != '\0') {
        if (postfix[i] == ' ') {
            i++;
            continue;
        }
        k = 0;
        while (postfix[i] != '\0' && postfix[i] != ' ' && k < MAX_TOKEN - 1)
            token[k++] = postfix[i++];
        token[k] = '\0';

        if (isdigit((unsigned char)token[0])) {             /* constant */
            parseFloat(token, &v);
            pushVal(v);
            strcpy(action, "push constant");
        } else if (isVariable(token[0])) {                  /* station value */
            v = (token[0] == 'T') ? T : (token[0] == 'D') ? D : (token[0] == 'H') ? H : F;
            pushVal(v);
            sprintf(action, "push %c = %g", token[0], v);
        } else {                                            /* operator */
            if (!popVal(&b) || !popVal(&a)) {
                printf("  %-7s | ERROR: value stack underflow (malformed postfix).\n", token);
                clearVal();
                return 0;
            }
            if (!applyOperator(token[0], a, b, &r)) {
                printf("  %-7s | ERROR: division by zero (%g / %g).\n", token, a, b);
                clearVal();
                return 0;
            }
            pushVal(r);
            sprintf(action, "%g %c %g = %g", a, token[0], b, r);
        }
        printf("  %-7s | %-34s | ", token, action);
        printValStack();
        printf("\n");
    }

    if (!popVal(answer) || valTop != NULL) {
        printf("  ERROR: rule did not reduce to a single value.\n");
        clearVal();
        return 0;
    }
    return 1;
}

/* Option 5: read a rule, convert it, read station values, evaluate. */
void convertAndEvaluate(void)
{
    char infix[LINE_LEN], postfix[POSTFIX_LEN];
    float T, D, H, F, answer;

    if (!isEmpty())
        printf("  Note: the stack held %d element(s); it is re-created for the conversion.\n",
               stackSize());

    printf("  Enter heatwave rule in infix (e.g. T>39&D>4|T>44): ");
    if (!readLine(infix, LINE_LEN))
        return;
    trim(infix);
    if ((int)strlen(infix) > MAX_EXPR) {
        printf("  ERROR: rule longer than %d characters.\n", MAX_EXPR);
        return;
    }

    printf("\n  Infix rule : %s\n", infix);
    if (!infixToPostfix(infix, postfix))
        return;
    printf("  Postfix    : %s\n\n", postfix);

    printf("  Enter station values for evaluation:\n");
    if (!readFloat("    T  (Tmax, deg C)                 : ", &T)) return;
    if (!readFloat("    D  (departure from normal, deg C): ", &D)) return;
    if (!readFloat("    H  (relative humidity, %)        : ", &H)) return;
    if (H < 0.0f || H > 100.0f) {
        printf("  Invalid humidity %.1f: must be between 0 and 100.\n", H);
        return;
    }
    if (!readFloat("    F  (feels-like, deg C)           : ", &F)) return;
    printf("\n");

    if (!evaluatePostfix(postfix, T, D, H, F, &answer))
        return;
    printf("\n  Result = %g  ->  %s\n", answer,
           answer != 0.0f ? "RULE FIRES: raise heatwave alert for this station."
                          : "Rule does not fire: no alert from this rule.");
}

void printMenu(void)
{
    printf("\n========= HEATSYNC Rule Compiler (stack using SLL) =========\n");
    printf("1. Push a character\n");
    printf("2. Pop\n");
    printf("3. Peek (display top)\n");
    printf("4. Display stack\n");
    printf("5. Convert rule INFIX -> POSTFIX and evaluate\n");
    printf("6. Exit\n");
}

int main(void)
{
    int choice;
    char buf[LINE_LEN], c;

    createStack();
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
            printf("  Enter a single character to push: ");
            if (!readLine(buf, LINE_LEN))
                break;
            trim(buf);
            if (strlen(buf) != 1) {
                printf("  Invalid input '%s': enter exactly one character.\n", buf);
                break;
            }
            push(buf[0]);
            printf("  Pushed '%c'. Stack size = %d.\n", buf[0], stackSize());
            break;

        case 2:
            if (isEmpty()) {
                printf("  UNDERFLOW: stack is empty, nothing to pop.\n");
                break;
            }
            c = pop();
            printf("  Popped '%c'. Stack size = %d.\n", c, stackSize());
            break;

        case 3:
            if (isEmpty())
                printf("  Stack is empty: no top element.\n");
            else
                printf("  Top element = '%c'.\n", peek());
            break;

        case 4:
            displayStack();
            break;

        case 5:
            convertAndEvaluate();
            break;

        case 6:
            createStack();
            clearVal();
            printf("  Stacks freed. Exiting.\n");
            return 0;

        default:
            printf("  Invalid choice %d. Please enter 1-6.\n", choice);
        }
    }
    createStack();
    clearVal();
    return 0;
}
