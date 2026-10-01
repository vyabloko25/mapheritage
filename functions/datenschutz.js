import { legalPage } from '../lib/legal.js';

export const onRequestGet = ({ request, env }) => legalPage('datenschutz', request, env);
