---
name: java-spring-boot
description: Build and maintain Java 21+ Spring Boot services with small, testable, backward-compatible changes; covers bean wiring, layers, transactions, reactive pipelines, and input validation.
entryType: instruction_skill
category: engineering
tags: java, spring-boot, spring, jpa, validation, transactions, kotlin
triggers: spring boot, spring mvc, spring data, springboot, java service, spring application
provides: java-service
outputs: A small backward-compatible Java change with tests, with a one-line summary of what was not changed.
version: 0.2.0
validationStatus: validated
sourceId: just-do-it-local
---

# Java / Spring Boot engineering

## Purpose and scope

Use this skill when the task involves a Java or Kotlin Spring Boot service: adding a feature, fixing a bug, changing a REST endpoint, updating a JPA entity, or adjusting Spring configuration.

Activate it when: the project's `pom.xml` or `build.gradle` declares `spring-boot-starter`.

Do not use this skill for: standalone Java libraries without Spring, Android development, or tasks that are primarily infrastructure changes (Kubernetes, CI pipelines).

## Prerequisites

Before editing any file:
1. Read `pom.xml` or `build.gradle` — note the Spring Boot version, Java version, and any BOM imports.
2. Identify the application's layer model: are there `@Controller`/`@RestController`, `@Service`, and `@Repository` components? Are they in separate packages?
3. Read the existing tests for the module you are changing — note the test framework (JUnit 5, Mockito, MockMvc, `@SpringBootTest`, `@WebMvcTest`, `@DataJpaTest`).
4. If you are changing a public API (REST endpoint, RPC interface), read whether there is an API versioning policy or a deprecation notice.

If the Spring Boot version is older than 2.7 and the change requires Spring 3.x APIs, stop and flag the version mismatch. Do not apply 3.x patterns to a 2.x codebase.

## Workflow

### 1. Understand the existing architecture

- Read the entry point class (`@SpringBootApplication`) to understand autoconfiguration and component scan scope.
- If the change involves a REST endpoint: read the controller, the service it delegates to, and the repository or external client the service uses.
- If the change involves configuration: read `application.yml`/`application.properties` and any `@ConfigurationProperties` class.
- Do not guess what a bean wires to — read the field injection or constructor, confirm by checking which implementation is available.

### 2. Plan the smallest correct change

State the change in one sentence before writing code. Examples:
- "Add a `GET /hotels/{id}` endpoint that delegates to `HotelService.findById`, returning 404 when absent."
- "Fix the null check in `PricingService.calculateRate` so a missing rate plan returns `Optional.empty()` instead of throwing NPE."

Changes that require touching more than three files are probably too large. Split them.

### 3. Validate inputs at the boundary

- Place validation annotations (`@NotNull`, `@Valid`, `@Size`, `@Pattern`) on the controller method parameter or request DTO.
- Do not duplicate validation logic inside the service layer — the service should trust that the controller has validated.
- Return actionable error messages (HTTP 400 with a field-level error body) without leaking stack traces or internal identifiers.
- Use Spring's `@ExceptionHandler` or `@ControllerAdvice` for consistent error responses. Do not add a new `try/catch` inside the controller if a `@ControllerAdvice` already handles the exception type.

### 4. Manage transactions explicitly

- Annotate the service method with `@Transactional(readOnly = true)` for queries and `@Transactional` for writes.
- Do not call a `@Transactional` method from within the same class — Spring's proxy will bypass the transaction. Move the call to a separate bean if needed.
- Lazy-loaded JPA associations must be accessed inside the transaction boundary. Do not return a hibernate proxy to the controller.
- For long-running writes, prefer `@Transactional(timeout = N)` with a documented value.

### 5. Reactive pipelines (if applicable)

- If the service already uses Spring WebFlux (`Mono`, `Flux`), do not introduce blocking calls (`block()`, JDBC without R2DBC) inside a reactive chain.
- Virtual threads (Java 21 `@EnableVirtualThreads`) are not a replacement for reactive programming — they eliminate the thread-blocking constraint but still require proper transaction management.
- Follow whichever concurrency model the codebase already uses. Do not mix them in a single module.

### 6. Write the tests

| Change type | Test type |
|---|---|
| Service logic | Unit test with Mockito; no Spring context |
| Controller endpoint | `@WebMvcTest` with MockMvc; mock the service |
| Repository query | `@DataJpaTest` with an in-memory H2/embedded DB |
| Integration | `@SpringBootTest` with `@TestContainers` only when the behaviour requires a real DB |

For each changed method: one test for the happy path, one for each meaningful failure path (not-found, invalid input, downstream error).

### 7. Preserve public API compatibility

- Do not remove or rename a REST endpoint that callers depend on.
- Do not add a required request field without a default.
- If an old endpoint must be retired, add `@Deprecated` and a replacement, then schedule removal.
- Bean names used in other modules must not change without auditing all usages.

## Decision rules

- **Constructor injection over field injection.** `@Autowired` on a field makes the bean impossible to test without starting the context.
- **Return `Optional<T>` from repository finders; map to 404 in the controller.** Do not throw from the repository.
- **Do not put business logic in `@Entity` classes.** Entities model persistence; put behavior in the service.
- **Do not put `@Transactional` on the controller.** Transactions belong on the service.
- **When two configurations conflict** (e.g. a `@Bean` in a test `@Configuration` shadowing a production bean), prefer the test-scoped bean for tests but do not change the production bean to accommodate the test.

## Verification and acceptance criteria

After making the change:
1. Run `mvn test -pl <module>` or `./gradlew :<module>:test`. All tests must pass.
2. Run `mvn verify` or `./gradlew check` if the project has integration tests.
3. Confirm the changed endpoint or method behaves as specified by running the tests added in step 6.
4. Confirm no previously passing test fails.

A change is complete when tests pass and the PR diff covers only what the one-sentence plan described.

## Failure handling

- **Spring context fails to start in tests** → read the error; usually a missing bean, a conflicting bean definition, or a missing property. Fix the test configuration before the change.
- **`LazyInitializationException`** → the lazy association was accessed outside the session. Eager-fetch what you need inside the transaction, or use a projection.
- **`TransactionRequiredException`** → the method is not inside a `@Transactional` context. Add the annotation to the right layer.
- **Compilation fails after dependency change** → check that the added dependency does not conflict with a managed BOM version. Use `mvn dependency:tree` or `./gradlew dependencies` to inspect the resolved tree.
- **Cannot write a test without starting the full context** → the component under test has too many responsibilities. Split it. Do not workaround by starting a heavyweight `@SpringBootTest` for a unit-level test.

## Deliverables

1. The code change (smallest set of files touched).
2. Tests added or updated.
3. One line naming what was not changed (scope guard).
4. Any remaining risk or follow-up noted explicitly.
