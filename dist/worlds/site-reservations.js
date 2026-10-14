import { getConfigSection } from '../content-config.js';
// Geometry interprets [site key, angle, distance, clear radius].
export const ISLAND_SITE_RESERVATIONS=getConfigSection('geography').siteReservations;
