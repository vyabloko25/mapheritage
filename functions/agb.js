import { legalPage } from '../lib/legal.js';

export const onRequestGet = ({ request, env }) => legalPage('agb', request, env);
