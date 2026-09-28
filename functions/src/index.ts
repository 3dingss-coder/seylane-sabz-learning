import { setGlobalOptions } from 'firebase-functions/v2';
import { onRequest } from 'firebase-functions/v2/https';
import { createApp } from './app';

// Region close to users; max instances keeps free-tier cost bounded (risk R4).
setGlobalOptions({ region: 'europe-west1', maxInstances: 10 });

/** HTTPS entrypoint: https://<region>-<project>.cloudfunctions.net/api/v1/... */
export const api = onRequest(createApp());
