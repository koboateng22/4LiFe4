import type { EmergencyCenter } from '../../types';

/* Pin colours follow the app's colour system and match the key under the map */
export const PIN_COLOUR: Record<EmergencyCenter['type'], string> = {
  hospital: '#e11d48',
  ems_station: '#b45309',
  rehab: '#047857',
  helpline: '#0369a1',
  clinic: '#db2777',
  pharmacy: '#0d9488',
  police: '#1d4ed8',
  fire_station: '#ea580c',
};
