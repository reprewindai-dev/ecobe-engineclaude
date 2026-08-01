```markdown
# ecobe-engineclaude Development Patterns

> Auto-generated skill from repository analysis

## Overview
This skill teaches you the core development patterns and conventions used in the `ecobe-engineclaude` TypeScript codebase. You'll learn about file naming, import/export styles, test organization, and how to follow the project's standards for maintainable and consistent code. While no frameworks or automated workflows were detected, this guide will help you contribute effectively and understand the project's structure.

## Coding Conventions

### File Naming
- **Style:** kebab-case
- **Example:**  
  ```
  user-service.ts
  data-model.ts
  ```

### Import Style
- **Relative imports are used throughout the codebase.**
- **Example:**
  ```typescript
  import { fetchData } from './data-service';
  ```

### Export Style
- **Named exports are preferred.**
- **Example:**
  ```typescript
  // In user-service.ts
  export function getUser(id: string) { ... }

  // Importing
  import { getUser } from './user-service';
  ```

### Commit Patterns
- **Freeform commit messages, no enforced prefixes.**
- **Average length:** ~40 characters
- **Example:**  
  ```
  Add support for user authentication
  Fix bug in data processing logic
  ```

## Workflows

### Adding a New Module
**Trigger:** When you need to introduce a new feature or logical unit.
**Command:** `/add-module`

1. Create a new file using kebab-case naming (e.g., `feature-module.ts`).
2. Use relative imports to include dependencies.
3. Export your functions or classes using named exports.
4. If applicable, create a corresponding test file named `feature-module.test.ts`.

### Writing Tests
**Trigger:** When you develop new functionality or fix bugs.
**Command:** `/write-test`

1. Create a test file with the pattern `*.test.ts` (e.g., `user-service.test.ts`).
2. Write tests using the project's preferred (but unspecified) testing framework.
3. Use relative imports to bring in the module under test.
4. Run your tests using the project's test runner (consult project documentation if needed).

## Testing Patterns

- **Test File Naming:**  
  Test files follow the pattern `*.test.ts`.
  ```
  user-service.test.ts
  data-model.test.ts
  ```
- **Framework:**  
  The specific testing framework is not detected; check the project for more details.
- **Import Style:**  
  Use relative imports in test files as in source files.
- **Example:**
  ```typescript
  import { getUser } from './user-service';

  describe('getUser', () => {
    it('returns user by id', () => {
      // test implementation
    });
  });
  ```

## Commands
| Command         | Purpose                                      |
|-----------------|----------------------------------------------|
| /add-module     | Scaffold a new module with conventions       |
| /write-test     | Create a new test file for a module/feature  |
```
