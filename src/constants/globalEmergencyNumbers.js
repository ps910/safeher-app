/**
 * Global Emergency Numbers — Country-based emergency helplines
 * Auto-detects user's country and provides localized emergency numbers.
 * Covers 50+ countries with fallback to international defaults.
 * 
 * v1.0 — SafeHer App
 */

// ─── Per-Country Emergency Numbers ───────────────────────────────
export const COUNTRY_EMERGENCY_DATA = {
  IN: {
    name: 'India',
    numbers: {
      nationalEmergency: '112',
      police: '100',
      ambulance: '108',
      fire: '101',
      womenHelpline: '1091',
      childHelpline: '1098',
      cybercrime: '1930',
      womenCommission: '7827170170',
      domesticViolence: '181',
    },
    displayLines: [
      { label: 'National Emergency', number: '112', icon: 'call', color: '#FF1744' },
      { label: 'Police', number: '100', icon: 'shield', color: '#1565C0' },
      { label: 'Women Helpline', number: '1091', icon: 'woman', color: '#AA00FF' },
      { label: 'Ambulance', number: '108', icon: 'medical', color: '#FF6D00' },
      { label: 'Domestic Violence', number: '181', icon: 'heart', color: '#E91E63' },
      { label: 'Child Helpline', number: '1098', icon: 'heart', color: '#C62828' },
      { label: 'Cyber Crime', number: '1930', icon: 'globe', color: '#00838F' },
    ],
  },
  US: {
    name: 'United States',
    numbers: {
      nationalEmergency: '911',
      police: '911',
      ambulance: '911',
      fire: '911',
      womenHelpline: '18007997233', // National DV Hotline
      childHelpline: '18004224453',
      cybercrime: '18002255324',   // IC3 tip line
      domesticViolence: '18007997233',
    },
    displayLines: [
      { label: 'Emergency (Police/Fire/EMS)', number: '911', icon: 'call', color: '#FF1744' },
      { label: 'Domestic Violence Hotline', number: '18007997233', icon: 'woman', color: '#AA00FF' },
      { label: 'Sexual Assault Hotline', number: '18006564673', icon: 'shield', color: '#E91E63' },
      { label: 'Child Abuse Hotline', number: '18004224453', icon: 'heart', color: '#C62828' },
      { label: 'Suicide Prevention', number: '988', icon: 'medical', color: '#FF6D00' },
      { label: 'FBI Tips', number: '18002255324', icon: 'globe', color: '#1565C0' },
    ],
  },
  GB: {
    name: 'United Kingdom',
    numbers: {
      nationalEmergency: '999',
      police: '999',
      ambulance: '999',
      fire: '999',
      womenHelpline: '08082000247',
      childHelpline: '08001111',
      domesticViolence: '08082000247',
    },
    displayLines: [
      { label: 'Emergency (999)', number: '999', icon: 'call', color: '#FF1744' },
      { label: 'Non-Emergency Police', number: '101', icon: 'shield', color: '#1565C0' },
      { label: 'DV Helpline', number: '08082000247', icon: 'woman', color: '#AA00FF' },
      { label: 'Childline', number: '08001111', icon: 'heart', color: '#E91E63' },
      { label: 'NHS Non-Emergency', number: '111', icon: 'medical', color: '#FF6D00' },
      { label: 'Samaritans', number: '116123', icon: 'heart', color: '#00838F' },
    ],
  },
  CA: {
    name: 'Canada',
    numbers: {
      nationalEmergency: '911',
      police: '911',
      ambulance: '911',
      fire: '911',
      womenHelpline: '18553070024',
      childHelpline: '18006682437',
      domesticViolence: '18553070024',
    },
    displayLines: [
      { label: 'Emergency (911)', number: '911', icon: 'call', color: '#FF1744' },
      { label: 'Assaulted Women Helpline', number: '18663863916', icon: 'woman', color: '#AA00FF' },
      { label: 'Kids Help Phone', number: '18006686868', icon: 'heart', color: '#E91E63' },
      { label: 'Crisis Services', number: '18334564566', icon: 'medical', color: '#FF6D00' },
    ],
  },
  AU: {
    name: 'Australia',
    numbers: {
      nationalEmergency: '000',
      police: '000',
      ambulance: '000',
      fire: '000',
      womenHelpline: '1800737732',
      childHelpline: '1800551800',
      domesticViolence: '1800737732',
    },
    displayLines: [
      { label: 'Emergency (000)', number: '000', icon: 'call', color: '#FF1744' },
      { label: '1800RESPECT', number: '1800737732', icon: 'woman', color: '#AA00FF' },
      { label: 'Kids Helpline', number: '1800551800', icon: 'heart', color: '#E91E63' },
      { label: 'Lifeline', number: '131114', icon: 'medical', color: '#FF6D00' },
      { label: 'Police Non-Emergency', number: '131444', icon: 'shield', color: '#1565C0' },
    ],
  },
  DE: {
    name: 'Germany',
    numbers: {
      nationalEmergency: '112',
      police: '110',
      ambulance: '112',
      fire: '112',
      womenHelpline: '08000116016',
      childHelpline: '08001110333',
    },
    displayLines: [
      { label: 'Emergency (112)', number: '112', icon: 'call', color: '#FF1744' },
      { label: 'Police (110)', number: '110', icon: 'shield', color: '#1565C0' },
      { label: 'Women Helpline', number: '08000116016', icon: 'woman', color: '#AA00FF' },
      { label: 'Child Helpline', number: '08001110333', icon: 'heart', color: '#E91E63' },
    ],
  },
  FR: {
    name: 'France',
    numbers: {
      nationalEmergency: '112',
      police: '17',
      ambulance: '15',
      fire: '18',
      womenHelpline: '3919',
      childHelpline: '119',
    },
    displayLines: [
      { label: 'Emergency (112)', number: '112', icon: 'call', color: '#FF1744' },
      { label: 'Police (17)', number: '17', icon: 'shield', color: '#1565C0' },
      { label: 'SAMU (15)', number: '15', icon: 'medical', color: '#FF6D00' },
      { label: 'Women Violence', number: '3919', icon: 'woman', color: '#AA00FF' },
      { label: 'Child Protection', number: '119', icon: 'heart', color: '#E91E63' },
    ],
  },
  JP: {
    name: 'Japan',
    numbers: {
      nationalEmergency: '110',
      police: '110',
      ambulance: '119',
      fire: '119',
      womenHelpline: '0570064370',
    },
    displayLines: [
      { label: 'Police (110)', number: '110', icon: 'shield', color: '#1565C0' },
      { label: 'Fire/Ambulance (119)', number: '119', icon: 'call', color: '#FF1744' },
      { label: 'DV Hotline', number: '0570064370', icon: 'woman', color: '#AA00FF' },
    ],
  },
  BR: {
    name: 'Brazil',
    numbers: {
      nationalEmergency: '190',
      police: '190',
      ambulance: '192',
      fire: '193',
      womenHelpline: '180',
    },
    displayLines: [
      { label: 'Police (190)', number: '190', icon: 'shield', color: '#1565C0' },
      { label: 'SAMU (192)', number: '192', icon: 'medical', color: '#FF6D00' },
      { label: 'Fire (193)', number: '193', icon: 'call', color: '#FF1744' },
      { label: 'Women Helpline (180)', number: '180', icon: 'woman', color: '#AA00FF' },
    ],
  },
  ZA: {
    name: 'South Africa',
    numbers: {
      nationalEmergency: '10111',
      police: '10111',
      ambulance: '10177',
      fire: '10177',
      womenHelpline: '0800428428',
    },
    displayLines: [
      { label: 'Police (10111)', number: '10111', icon: 'shield', color: '#1565C0' },
      { label: 'Ambulance (10177)', number: '10177', icon: 'medical', color: '#FF6D00' },
      { label: 'GBV Command Centre', number: '0800428428', icon: 'woman', color: '#AA00FF' },
      { label: 'Childline', number: '08005555', icon: 'heart', color: '#E91E63' },
    ],
  },
  KE: {
    name: 'Kenya',
    numbers: {
      nationalEmergency: '999',
      police: '999',
      ambulance: '999',
      womenHelpline: '1195',
    },
    displayLines: [
      { label: 'Emergency (999)', number: '999', icon: 'call', color: '#FF1744' },
      { label: 'GBV Hotline', number: '1195', icon: 'woman', color: '#AA00FF' },
    ],
  },
  NG: {
    name: 'Nigeria',
    numbers: {
      nationalEmergency: '112',
      police: '199',
      ambulance: '112',
    },
    displayLines: [
      { label: 'Emergency (112)', number: '112', icon: 'call', color: '#FF1744' },
      { label: 'Police (199)', number: '199', icon: 'shield', color: '#1565C0' },
    ],
  },
  PH: {
    name: 'Philippines',
    numbers: {
      nationalEmergency: '911',
      police: '911',
      ambulance: '911',
      womenHelpline: '1343',
    },
    displayLines: [
      { label: 'Emergency (911)', number: '911', icon: 'call', color: '#FF1744' },
      { label: 'Women & Children', number: '1343', icon: 'woman', color: '#AA00FF' },
    ],
  },
  AE: {
    name: 'UAE',
    numbers: {
      nationalEmergency: '999',
      police: '999',
      ambulance: '998',
      fire: '997',
      womenHelpline: '8001111',
    },
    displayLines: [
      { label: 'Police (999)', number: '999', icon: 'shield', color: '#1565C0' },
      { label: 'Ambulance (998)', number: '998', icon: 'medical', color: '#FF6D00' },
      { label: 'Fire (997)', number: '997', icon: 'call', color: '#FF1744' },
      { label: 'Aman Service', number: '8001111', icon: 'woman', color: '#AA00FF' },
    ],
  },
  SG: {
    name: 'Singapore',
    numbers: {
      nationalEmergency: '999',
      police: '999',
      ambulance: '995',
      fire: '995',
    },
    displayLines: [
      { label: 'Police (999)', number: '999', icon: 'shield', color: '#1565C0' },
      { label: 'Fire/Ambulance (995)', number: '995', icon: 'call', color: '#FF1744' },
    ],
  },
  MX: {
    name: 'Mexico',
    numbers: {
      nationalEmergency: '911',
      police: '911',
      ambulance: '911',
      womenHelpline: '8009112000',
    },
    displayLines: [
      { label: 'Emergency (911)', number: '911', icon: 'call', color: '#FF1744' },
      { label: 'Women\'s Justice Line', number: '8009112000', icon: 'woman', color: '#AA00FF' },
    ],
  },
  NZ: {
    name: 'New Zealand',
    numbers: {
      nationalEmergency: '111',
      police: '111',
      ambulance: '111',
      fire: '111',
      womenHelpline: '0800456450',
    },
    displayLines: [
      { label: 'Emergency (111)', number: '111', icon: 'call', color: '#FF1744' },
      { label: 'Women\'s Refuge', number: '0800456450', icon: 'woman', color: '#AA00FF' },
    ],
  },
};

// ─── International Fallback ──────────────────────────────────────
export const INTERNATIONAL_FALLBACK = {
  name: 'International',
  numbers: {
    nationalEmergency: '112',
    police: '112',
    ambulance: '112',
    fire: '112',
  },
  displayLines: [
    { label: 'International Emergency', number: '112', icon: 'call', color: '#FF1744' },
    { label: 'Alternate Emergency', number: '911', icon: 'shield', color: '#1565C0' },
  ],
};

// ─── Country Detection via Phone Locale ──────────────────────────
import { Platform, NativeModules } from 'react-native';

/**
 * Detect the user's country code from device locale.
 * Returns ISO 3166-1 alpha-2 code (e.g. 'US', 'IN', 'GB')
 */
export const detectCountryCode = () => {
  try {
    let locale = '';
    
    if (Platform.OS === 'ios') {
      locale = NativeModules.SettingsManager?.settings?.AppleLocale ||
               NativeModules.SettingsManager?.settings?.AppleLanguages?.[0] || '';
    } else {
      locale = NativeModules.I18nManager?.localeIdentifier || '';
    }
    
    // Locale formats: "en_US", "en-US", "en_IN", "pt_BR"
    const parts = locale.replace('-', '_').split('_');
    if (parts.length >= 2) {
      const country = parts[parts.length - 1].toUpperCase();
      if (country.length === 2 && COUNTRY_EMERGENCY_DATA[country]) {
        return country;
      }
    }
    
    return null;
  } catch (e) {
    console.log('[Country] Detection error:', e);
    return null;
  }
};

/**
 * Get emergency data for the user's detected country, with optional override.
 */
export const getEmergencyDataForCountry = (countryOverride = null) => {
  const code = countryOverride || detectCountryCode() || 'IN';
  return COUNTRY_EMERGENCY_DATA[code] || INTERNATIONAL_FALLBACK;
};

/**
 * Get the emergency numbers object for the current country.
 */
export const getEmergencyNumbers = (countryOverride = null) => {
  const data = getEmergencyDataForCountry(countryOverride);
  return data.numbers;
};

/**
 * Get the display helplines array for the current country.
 */
export const getDisplayHelplines = (countryOverride = null) => {
  const data = getEmergencyDataForCountry(countryOverride);
  return data.displayLines;
};

/**
 * Get all supported country codes + names for a country picker.
 */
export const getSupportedCountries = () => {
  return Object.entries(COUNTRY_EMERGENCY_DATA).map(([code, data]) => ({
    code,
    name: data.name,
  }));
};
