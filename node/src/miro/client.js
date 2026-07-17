'use strict';

const axios = require('axios');
// axios-retry is ESM-default in v4, CJS in v3 — support both.
const axiosRetryModule = require('axios-retry');
const axiosRetry = axiosRetryModule.default || axiosRetryModule;
const isNetworkOrIdempotentRequestError =
  axiosRetryModule.isNetworkOrIdempotentRequestError;

const BASE_URL = 'https://api.miro.com/v2';

const createMiroClient = () => {
  const token = process.env.MIRO_ACCESS_TOKEN;
  if (!token) {
    throw new Error('MIRO_ACCESS_TOKEN is not set. Copy .env.example to .env and fill it in.');
  }

  const client = axios.create({
    baseURL: BASE_URL,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
  });

  axiosRetry(client, {
    retries: 4,
    retryDelay: axiosRetry.exponentialDelay,
    retryCondition: (error) => {
      const status = error.response && error.response.status;
      if (status === 429 || (status >= 500 && status < 600)) return true;
      return isNetworkOrIdempotentRequestError
        ? isNetworkOrIdempotentRequestError(error)
        : false;
    },
  });

  return client;
};

module.exports = { createMiroClient };
