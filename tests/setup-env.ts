process.env.NODE_ENV = 'test';
process.env.PORT = '3001';
process.env.SERVICE_NAME = 'iam-api';
process.env.LOG_LEVEL = 'silent';
process.env.DATABASE_URL =
  'postgresql://iam_api:iam_api_dev_password@localhost:5432/iam_api_test?schema=public';
