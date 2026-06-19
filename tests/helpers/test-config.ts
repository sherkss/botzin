// Test database and credentials — never used in production.
// Override MySQL connection via env vars if your local setup differs.
export const TEST_DB = "botzin_test";
export const MYSQL_HOST = process.env.BOTZIN_MYSQL_HOST ?? "127.0.0.1";
export const MYSQL_PORT = Number(process.env.BOTZIN_MYSQL_PORT ?? "3306");
export const MYSQL_USER = process.env.BOTZIN_MYSQL_USER ?? "botzin";
export const MYSQL_PASSWORD = process.env.BOTZIN_MYSQL_PASSWORD ?? "botzin";

// Long enough to pass JwtService.assertSecret()
export const TEST_JWT_SECRET = "botzin-test-jwt-secret-long-enough-for-testing-only";

// Test users created in globalSetup and preserved between tests.
export const ADMIN_USER = "test_admin";
export const ADMIN_PASS = "TestAdmin_P4ss!";
export const OPERATOR_USER = "test_operator";
export const OPERATOR_PASS = "TestOperator_P4ss!";
export const VIEWER_USER = "test_viewer";
export const VIEWER_PASS = "TestViewer_P4ss!";
