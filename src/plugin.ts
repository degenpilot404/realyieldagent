import type { Plugin } from '@elizaos/core';
import {
  type Action,
  type Content,
  type GenerateTextParams,
  type HandlerCallback,
  type IAgentRuntime,
  type Memory,
  ModelType,
  type Provider,
  type ProviderResult,
  Service,
  type State,
  logger,
  UUID,
  createUniqueUuid,
} from '@elizaos/core';
import { z } from 'zod';
import starterTestSuite from './tests';
import { URL } from 'url';

/**
 * Define the configuration schema for the plugin with the following properties:
 *
 * @param {string} EXAMPLE_PLUGIN_VARIABLE - The name of the plugin (min length of 1, optional)
 * @returns {object} - The configured schema object
 */
const configSchema = z.object({
  EXAMPLE_PLUGIN_VARIABLE: z
    .string()
    .min(1, 'Example plugin variable is not provided')
    .optional()
    .transform((val) => {
      if (!val) {
        console.warn('Warning: Example plugin variable is not provided');
      }
      return val;
    }),
});

/**
 * Example HelloWorld action
 * This demonstrates the simplest possible action structure
 */
/**
 * Represents an action that responds with a simple hello world message.
 *
 * @typedef {Object} Action
 * @property {string} name - The name of the action
 * @property {string[]} similes - The related similes of the action
 * @property {string} description - Description of the action
 * @property {Function} validate - Validation function for the action
 * @property {Function} handler - The function that handles the action
 * @property {Object[]} examples - Array of examples for the action
 */
const helloWorldAction: Action = {
  name: 'HELLO_WORLD',
  similes: ['GREET', 'SAY_HELLO'],
  description: 'Responds with a simple hello world message',

  validate: async (_runtime: IAgentRuntime, message: Memory): Promise<boolean> => {
    const text = (message.content.text || '').toLowerCase().trim();
    return /^(hi|hello|hey)\b/.test(text);
  },

  handler: async (
    _runtime: IAgentRuntime,
    message: Memory,
    _state: State,
    _options: any,
    callback: HandlerCallback,
    _responses: Memory[]
  ) => {
    try {
      logger.info('Handling HELLO_WORLD action');

      // Simple response content
      const responseContent: Content = {
        text: 'hello world!',
        actions: ['HELLO_WORLD'],
        source: message.content.source,
      };

      // Call back with the hello world message
      await callback(responseContent);

      return responseContent;
    } catch (error) {
      logger.error('Error in HELLO_WORLD action:', error);
      throw error;
    }
  },

  examples: [
    [
      {
        name: '{{name1}}',
        content: {
          text: 'Can you say hello?',
        },
      },
      {
        name: '{{name2}}',
        content: {
          text: 'hello world!',
          actions: ['HELLO_WORLD'],
        },
      },
    ],
  ],
};

/**
 * Example Hello World Provider
 * This demonstrates the simplest possible provider implementation
 */
const helloWorldProvider: Provider = {
  name: 'HELLO_WORLD_PROVIDER',
  description: 'A simple example provider',

  get: async (
    _runtime: IAgentRuntime,
    _message: Memory,
    _state: State
  ): Promise<ProviderResult> => {
    return {
      text: 'I am a provider',
      values: {},
      data: {},
    };
  },
};

/**
 * PreferencesProvider - Persists and retrieves user search criteria for property listings
 */
const preferencesProvider: Provider = {
  name: 'PREFERENCES_PROVIDER',
  description: 'Provides access to user preferences including saved property search criteria',

  get: async (
    runtime: IAgentRuntime,
    message: Memory,
    _state: State
  ): Promise<ProviderResult> => {
    // Default empty preferences
    let preferences = {
      area: null,
      propertyType: null,
      bedrooms: null,
      maxPrice: null,
      minPrice: null,
      yieldFloor: null,
      furnished: null,
      lastUpdated: null,
    };

    try {
      // Get user ID from message - simplified to reduce type errors
      const userId = message.id;
      if (!userId) {
        return { text: '', values: { preferences }, data: { preferences } };
      }

      // This is a simplified version to avoid type errors
      // In an actual implementation, you'd use the SQL adapter directly
      // We'll stub this for now and implement it properly when the full schema is known
      // runtime.sql would be accessed through a proper adapter in a real implementation
      const results = await (runtime as any).sql?.query?.(
        `SELECT * FROM preferences WHERE user_id = ? ORDER BY last_updated DESC LIMIT 1`,
        [userId]
      ) || [];
      
      if (results && results.length > 0) {
        const pref = results[0];
        preferences = {
          area: pref.area,
          propertyType: pref.property_type,
          bedrooms: pref.bedrooms,
          maxPrice: pref.max_price,
          minPrice: pref.min_price,
          yieldFloor: pref.yield_floor,
          furnished: pref.furnished,
          lastUpdated: pref.last_updated,
        };
      }
    } catch (error) {
      logger.error('Error retrieving preferences:', error);
    }

    // Return preferences as provider values and data
    return {
      text: '',
      values: {
        preferences,
      },
      data: {
        preferences,
      },
    };
  },
};

// Helper to fetch ads from an n8n webhook
async function fetchAds(searchCriteria: { area?: string; bedrooms?: string | number; maxPrice?: number }): Promise<{title: string; price: string; link: string}[]> {
  // Dynamically import fetch (node-fetch)
  const fetchModule = await import('node-fetch');
  const fetch = fetchModule.default;

  const N8N_WEBHOOK_URL = 'https://realyield.app.n8n.cloud/webhook/search-listings';

  // Construct the payload based on available criteria
  const payload: any = {};
  if (searchCriteria.area) payload.area = searchCriteria.area;
  if (searchCriteria.bedrooms) {
    // Ensure bedrooms is a number if it's a string like "studio" or a numeric string
    if (typeof searchCriteria.bedrooms === 'string') {
      if (searchCriteria.bedrooms.toLowerCase() === 'studio') {
        payload.bedrooms = 0; // Assuming n8n expects 0 for studio
      } else {
        const numBedrooms = parseInt(searchCriteria.bedrooms, 10);
        if (!isNaN(numBedrooms)) {
          payload.bedrooms = numBedrooms;
        }
      }
    } else {
      payload.bedrooms = searchCriteria.bedrooms; // It's already a number
    }
  }
  if (searchCriteria.maxPrice) payload.maxPrice = searchCriteria.maxPrice;

  // Only proceed if we have at least one criterion for the webhook
  if (Object.keys(payload).length === 0) {
    logger.info('[fetchAds] No valid criteria provided for n8n webhook, returning empty results.');
    return [];
  }

  logger.info(`[fetchAds] Calling n8n webhook with payload: ${JSON.stringify(payload)}`);

  const res = await fetch(N8N_WEBHOOK_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': 'RealYieldAgent/1.0', // Good practice to set a User-Agent
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const errorBody = await res.text();
    logger.error(`[fetchAds] n8n webhook search failed – status ${res.status}, body: ${errorBody}`);
    throw new Error(`n8n webhook search failed – status ${res.status}`);
  }

  // Assuming n8n returns a JSON array of listings in the format: 
  // [{ title: string, price: string, link: string }, ...]
  // Or it might be nested, e.g., { listings: [...] } or { data: { listings: [...] } }
  // Adjust parsing based on actual n8n webhook response structure.
  const responseJson = await res.json() as any; 
  let rawListings: any[] = [];

  // Attempt to find the listings array in common structures
  if (Array.isArray(responseJson)) {
    rawListings = responseJson;
  } else if (responseJson.listings && Array.isArray(responseJson.listings)) {
    rawListings = responseJson.listings;
  } else if (responseJson.data && responseJson.data.listings && Array.isArray(responseJson.data.listings)) {
    rawListings = responseJson.data.listings;
  } else {
    logger.warn('[fetchAds] n8n webhook response format not recognized or no listings array found.', responseJson);
    return [];
  }

  // Map to the expected ads format, ensuring all fields are present
  const ads: { title: string; price: string; link: string }[] = rawListings
    .map((item: any) => ({
      title: item.title || 'No Title',
      price: item.price || 'Price not specified',
      link: item.link || '#', // Provide a fallback link
    }))
    .filter(ad => ad.link && ad.link !== '#') // Ensure link is valid
    .slice(0, 5); // Limit to 5 ads

  logger.info(`[fetchAds] Received ${ads.length} valid listings from n8n webhook.`);
  return ads;
}

// Helper for saving search preferences to database
async function saveSearchPreferences(
  runtime: IAgentRuntime,
  userId: string, 
  preferences: { 
    area?: string;
    propertyType?: string;
    bedrooms?: string | number;
    maxPrice?: number;
    minPrice?: number;
  }
): Promise<void> {
  try {
    // Skip if missing essential info
    if (!userId || !preferences) return;
    
    // Cast runtime to access sql
    const sql = (runtime as any).sql;
    if (!sql) return;
    
    // Check if user already has preferences
    const existingPrefs = await sql.query(
      `SELECT id FROM preferences WHERE user_id = ?`,
      [userId]
    );
    
    if (existingPrefs && existingPrefs.length > 0) {
      // Update existing preferences
      await sql.query(
        `UPDATE preferences SET 
          area = COALESCE(?, area),
          property_type = COALESCE(?, property_type),
          bedrooms = COALESCE(?, bedrooms),
          max_price = COALESCE(?, max_price),
          min_price = COALESCE(?, min_price),
          last_updated = CURRENT_TIMESTAMP
          WHERE user_id = ?`,
        [
          preferences.area || null,
          preferences.propertyType || null,
          preferences.bedrooms?.toString() || null,
          preferences.maxPrice || null,
          preferences.minPrice || null,
          userId
        ]
      );
    } else {
      // Insert new preferences
      await sql.query(
        `INSERT INTO preferences (
          user_id, area, property_type, bedrooms, max_price, min_price, last_updated
        ) VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
        [
          userId,
          preferences.area || null,
          preferences.propertyType || null,
          preferences.bedrooms?.toString() || null,
          preferences.maxPrice || null,
          preferences.minPrice || null
        ]
      );
    }
    
    // Log the search in search_logs
    const searchId = createUniqueUuid(runtime, `search-${userId}-${Date.now()}`);
    await sql.query(
      `INSERT INTO search_logs (
        search_id, user_id, timestamp, criteria_json, listings_returned
      ) VALUES (?, ?, CURRENT_TIMESTAMP, ?, 0)`,
      [
        searchId,
        userId,
        JSON.stringify(preferences)
      ]
    );
    
  } catch (error) {
    logger.error('Error saving search preferences:', error);
  }
}

// Helper to extract property search criteria from text
function extractSearchCriteria(text: string): {
  area?: string;
  propertyType?: string;
  bedrooms?: string;
  maxPrice?: number;
  minPrice?: number;
} {
  const criteria: any = {};
  
  // Areas - common Dubai locations
  const areaPatterns = [
    'Downtown', 'Dubai Marina', 'JBR', 'Palm Jumeirah', 'Business Bay', 
    'JVC', 'JVT', 'Jumeirah Village', 'DIFC', 'International City', 
    'Sports City', 'Motor City', 'Arabian Ranches', 'Mirdif', 'Barsha',
    'Al Barsha', 'Dubai Hills', 'MBR City', 'Dubai South', 'Dubailand',
    'Dubai Creek', 'Zabeel', 'Deira', 'Bur Dubai', 'Jumeirah', 'Umm Suqeim',
    'Discovery Gardens', 'Gardens', 'Jebel Ali', 'Dubai Production City', 'IMPZ',
    'Dubai Silicon Oasis', 'DSO', 'Al Furjan', 'The Greens'
  ];
  
  // Look for any area mentions
  for (const area of areaPatterns) {
    if (text.toLowerCase().includes(area.toLowerCase())) {
      criteria.area = area;
      break;
    }
  }
  
  // Property types
  if (text.toLowerCase().includes('apartment') || text.toLowerCase().includes('flat')) {
    criteria.propertyType = 'apartment';
  } else if (text.toLowerCase().includes('villa') || text.toLowerCase().includes('house')) {
    criteria.propertyType = 'villa';
  } else if (text.toLowerCase().includes('townhouse')) {
    criteria.propertyType = 'townhouse';
  } else if (text.toLowerCase().includes('penthouse')) {
    criteria.propertyType = 'penthouse';
  }
  
  // Bedrooms (supporting abbreviations like bd, bdr, bhk)
  const bedroomMatch = text.match(/(\d+)\s*(?:bed|beds?|bedroom|bedrooms?|br|bd|bdr|bhk)/i);
  if (bedroomMatch) {
    criteria.bedrooms = bedroomMatch[1];
  } else if (text.toLowerCase().includes('studio')) {
    criteria.bedrooms = 'studio';
  }
  
  // Price range patterns
  // Max price: "under X", "below X", "less than X", "max X", "up to X"
  const maxPriceMatch = text.match(/(?:under|below|less than|max|maximum|up to)\s*(?:AED)?\s*(\d+(?:,\d+)*(?:\.\d+)?)\s*(?:AED|dhs|dirhams|k|million|m)?/i);
  if (maxPriceMatch) {
    let price = maxPriceMatch[1].replace(/,/g, '');
    let value = parseFloat(price);
    
    // Convert to millions if needed
    if (maxPriceMatch[0].toLowerCase().includes('million') || maxPriceMatch[0].toLowerCase().includes('m')) {
      value = value * 1000000;
    } else if (maxPriceMatch[0].toLowerCase().includes('k')) {
      value = value * 1000;
    }
    
    criteria.maxPrice = Math.round(value);
  }
  
  // Min price: "above X", "over X", "more than X", "min X", "at least X"
  const minPriceMatch = text.match(/(?:above|over|more than|min|minimum|at least)\s*(?:AED)?\s*(\d+(?:,\d+)*(?:\.\d+)?)\s*(?:AED|dhs|dirhams|k|million|m)?/i);
  if (minPriceMatch) {
    let price = minPriceMatch[1].replace(/,/g, '');
    let value = parseFloat(price);
    
    // Convert to millions if needed
    if (minPriceMatch[0].toLowerCase().includes('million') || minPriceMatch[0].toLowerCase().includes('m')) {
      value = value * 1000000;
    } else if (minPriceMatch[0].toLowerCase().includes('k')) {
      value = value * 1000;
    }
    
    criteria.minPrice = Math.round(value);
  }
  
  return criteria;
}

// New and enhanced action for searching property listings
const searchListingsAction: Action = {
  name: 'SEARCH_LISTINGS',
  similes: [
    'FIND_PROPERTY', 'PROPERTY_SEARCH', 'FIND_LISTINGS', 'SHOW_PROPERTIES', 
    'GET_LISTINGS', 'BUY_PROPERTY', 'SHOW_OPTIONS', 'LIST_PROPERTIES'
  ],
  description: 'Searches property listings based on user criteria with preference memory',

  validate: async (_runtime: IAgentRuntime, message: Memory, state: State) => {
    const text = (message.content.text || '').toLowerCase();
    
    // Check if awaiting specific information in a search flow
    if (state.values.awaitingPropertyCriteria === true || 
        state.values.showingListingResults === true) {
      return true;
    }

    // Search keywords that indicate this action
    const searchKeywords = [
      'find property', 'find apartment', 'find villa', 'find home', 
      'search for property', 'search for apartment', 'search for villa',
      'show me property', 'show me properties', 'show me listings',
      'show listings', 'property listings', 'property options',
      'looking to buy', 'want to buy', 'buy property', 'buy a house',
      'get listings', 'get property', 'list properties',
      'find links', 'find me links', 'links to listings', 'property links'
    ];
    
    // If the message contains any of our search keywords
    for (const keyword of searchKeywords) {
      if (text.includes(keyword)) {
        return true;
      }
    }
    
    // Check for "Show me X bed in Y area under Z price" patterns
    const bedroomPattern = /\d+\s*(?:bed|beds?|bedroom|bedrooms?|br|bd|bdr|bhk)/i;
    const areaPattern = /in\s+([A-Za-z\s]+)(?:$|\s+under|\s+below|\s+with)/i;
    const pricePattern = /(?:under|below|less than|max|up to)\s*(?:AED)?\s*\d+/i;
    
    if (bedroomPattern.test(text) && (areaPattern.test(text) || pricePattern.test(text))) {
      return true;
    }
    
    // For "new listings" or "saved criteria" patterns
    if ((text.includes('new') || text.includes('latest')) &&
        (text.includes('listing') || text.includes('properties'))) {
      return true;
    }
    
    // Reminder patterns like "what was I looking for" or "my search"
    if ((text.includes('my') || text.includes('previous') || text.includes('last')) &&
        (text.includes('search') || text.includes('criteria') || text.includes('preference'))) {
      return true;
    }
    
    return false;
  },

  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    state: State,
    _options: any,
    callback: HandlerCallback
  ) => {
    const text = (message.content.text || '').trim();
    const userId = message.id;
    const messageSource = message.content.source;
    
    // If we're showing listing results and user asks for more
    if (state.values.showingListingResults === true) {
      const showMorePattern = /(?:show|send|get|give)\s+(?:more|next)/i;
      const narrowPattern = /(?:narrow|filter|tighten|refine|specific|less)/i;
      const savePattern = /(?:save|store|remember|keep)\s+(?:this|these|search|criteria)/i;
      
      if (showMorePattern.test(text)) {
        // Show next batch of listings
        try {
          const criteriaForNextBatch = state.values.lastSearchCriteria || {};
          const additionalAds = await fetchAds(criteriaForNextBatch);
          
          const lines = additionalAds.map((a, idx) => {
            // Ensure links are clickable and lists are well-formatted for Discord
            return `**${idx + 1}. ${a.title.replace(/\n/g, ' ')} – ${String(a.price).replace(/\n/g, ' ')}**\n<${a.link}>`;
          }).join('\n\n'); // Double newline for better separation between list items
          
          const responseText = additionalAds.length
            ? `Here are more options matching your criteria:\n\n${lines}\n\nWhat would you like to do next? You can ask to see more, refine the search, or save these criteria.`
            : `I don't have any more listings that match your current criteria. Would you like to broaden your search or try different terms?`;

          const response: Content = {
            text: responseText,
            actions: ['SEARCH_LISTINGS'],
            source: messageSource,
          };
          
          await callback(response);
          return response;
          
        } catch (error) {
          logger.error('Error fetching additional listings:', error);
          const errorResponse: Content = {
            text: `I encountered an issue getting more listings. Would you like to try a different search?`,
            actions: ['SEARCH_LISTINGS'],
            source: messageSource,
          };
          
          await callback(errorResponse);
          return errorResponse;
        }
      } else if (narrowPattern.test(text)) {
        state.values.showingListingResults = false;
        state.values.awaitingPropertyCriteria = true;
        
        const response: Content = {
          text: `Let's refine your search. Please tell me which aspect you'd like to adjust (area, property type, bedrooms, price range)?`,
          actions: ['SEARCH_LISTINGS'],
          source: messageSource,
        };
        
        await callback(response);
        return response;
        
      } else if (savePattern.test(text)) {
        const criteriaToSave = state.values.lastSearchCriteria || {};
        
        try {
          await saveSearchPreferences(runtime, userId, criteriaToSave);
          
          const response: Content = {
            text: `I've saved your search preferences. I'll remember that you're interested in ${
              criteriaToSave.propertyType ? criteriaToSave.propertyType + ' ' : ''
            }${
              criteriaToSave.bedrooms ? criteriaToSave.bedrooms + ' bedroom ' : ''
            }properties${
              criteriaToSave.area ? ' in ' + criteriaToSave.area : ''
            }${
              criteriaToSave.maxPrice ? ' under AED ' + criteriaToSave.maxPrice.toLocaleString() : ''
            }. You can ask me for "new listings" anytime to see the latest matches.`,
            actions: ['SEARCH_LISTINGS'],
            source: messageSource,
          };
          
          await callback(response);
          return response;
          
        } catch (error) {
          logger.error('Error saving search criteria:', error);
          const errorResponse: Content = {
            text: `I tried to save your preferences but encountered an issue. You can still continue browsing properties or try a new search.`,
            actions: ['SEARCH_LISTINGS'],
            source: messageSource,
          };
          
          await callback(errorResponse);
          return errorResponse;
        }
      }
    }
    
    if (state.values.awaitingPropertyCriteria) {
      state.values.awaitingPropertyCriteria = false;
      
      const currentCriteria = extractSearchCriteria(text);
      state.values.lastSearchCriteria = currentCriteria;
      
      try {
        const ads = await fetchAds(currentCriteria);
        await saveSearchPreferences(runtime, userId, currentCriteria);
        
        try {
          await (runtime as any).sql?.query?.(
            `UPDATE search_logs SET listings_returned = ? WHERE user_id = ? ORDER BY timestamp DESC LIMIT 1`,
            [ads.length, userId]
          );
        } catch (error) {
          logger.error('Error updating search_logs count:', error);
        }
        
        const lines = ads.map((a, idx) => {
          return `**${idx + 1}. ${a.title.replace(/\n/g, ' ')} – ${String(a.price).replace(/\n/g, ' ')}**\n<${a.link}>`;
        }).join('\n\n');
        
        state.values.showingListingResults = true;
        
        const responseText = ads.length
          ? `Here are ${ads.length} properties matching your criteria:\n\n${lines}\n\nWhat would you like to do next? You can ask to see more, refine the search, or save these criteria.`
          : `I couldn't find any listings matching your specific criteria. Would you like to try a broader search or different terms?`;

        const response: Content = {
          text: responseText,
          actions: ['SEARCH_LISTINGS'],
          source: messageSource,
        };
        
        await callback(response);
        return response;
        
      } catch (error) {
        logger.error('Error fetching property listings:', error);
        const errorResponse: Content = {
          text: `I encountered an issue searching for properties. Please try again with different criteria.`,
          actions: ['SEARCH_LISTINGS'],
          source: messageSource,
        };
        
        await callback(errorResponse);
        return errorResponse;
      }
    }
    
    const savedSearchPattern = /(?:show|get|what|my)\s+(?:previous|saved|last|recent)?\s*(?:search|criteria|preferences)/i;
    const newListingsPattern = /(?:new|latest|recent|updated)\s+(?:listings|properties|options)/i;
    
    if (savedSearchPattern.test(text) || newListingsPattern.test(text)) {
      try {
        const savedPreferencesResult = await (runtime as any).sql?.query?.(
          `SELECT area, property_type, bedrooms, max_price, min_price, yield_floor, furnished
           FROM preferences WHERE user_id = ? ORDER BY last_updated DESC LIMIT 1`,
          [userId]
        );
        
        if (savedPreferencesResult && savedPreferencesResult.length > 0) {
          const pref = savedPreferencesResult[0];
          const criteriaFromDb = {
            area: pref.area,
            propertyType: pref.property_type,
            bedrooms: pref.bedrooms,
            maxPrice: pref.max_price ? parseInt(pref.max_price) : undefined,
            minPrice: pref.min_price ? parseInt(pref.min_price) : undefined,
          };
          state.values.lastSearchCriteria = criteriaFromDb;
          
          const ads = await fetchAds(criteriaFromDb);
          
          const lines = ads.map((a, idx) => {
            return `**${idx + 1}. ${a.title.replace(/\n/g, ' ')} – ${String(a.price).replace(/\n/g, ' ')}**\n<${a.link}>`;
          }).join('\n\n');
          
          state.values.showingListingResults = true;
          
          const responseText = ads.length
            ? `Based on your saved preferences ${
              newListingsPattern.test(text) ? '(showing latest listings)' : ''
              }, here are ${ads.length} properties matching:\n\n${lines}\n\nWhat would you like to do next? You can ask to see more, refine the search, or update your saved preferences.`
            : `I couldn't find any current listings matching your saved preferences. Would you like to try different criteria?`;

          const response: Content = {
            text: responseText,
            actions: ['SEARCH_LISTINGS'],
            source: messageSource,
          };
          
          await callback(response);
          return response;
          
        } else {
          state.values.awaitingPropertyCriteria = true;
          const response: Content = {
            text: `I don't have any saved search preferences for you yet. What kind of property are you looking for? Please specify area, property type, number of bedrooms and/or price range.`,
            actions: ['SEARCH_LISTINGS'],
            source: messageSource,
          };
          await callback(response);
          return response;
        }
      } catch (error) {
        logger.error('Error retrieving saved preferences or fetching ads:', error);
        state.values.awaitingPropertyCriteria = true;
        const errorResponse: Content = {
          text: `I encountered an issue with your saved preferences. Let's start a new search - what are you looking for?`,
          actions: ['SEARCH_LISTINGS'],
          source: messageSource,
        };
        await callback(errorResponse);
        return errorResponse;
      }
    }
    
    const initialCriteria = extractSearchCriteria(text);
    if (
      (initialCriteria.area || initialCriteria.propertyType || initialCriteria.bedrooms) &&
      (initialCriteria.maxPrice || initialCriteria.minPrice || initialCriteria.area) // Ensure enough detail
    ) {
      state.values.lastSearchCriteria = initialCriteria;
      
      try {
        const ads = await fetchAds(initialCriteria);
        await saveSearchPreferences(runtime, userId, initialCriteria);
        
        try {
          await (runtime as any).sql?.query?.(
            `UPDATE search_logs SET listings_returned = ? WHERE user_id = ? ORDER BY timestamp DESC LIMIT 1`,
            [ads.length, userId]
          );
        } catch (error) {
          logger.error('Error updating search_logs count:', error);
        }

        const lines = ads.map((a, idx) => {
          return `**${idx + 1}. ${a.title.replace(/\n/g, ' ')} – ${String(a.price).replace(/\n/g, ' ')}**\n<${a.link}>`;
        }).join('\n\n');
        
        state.values.showingListingResults = true;
        
        const responseText = ads.length
          ? `Here are ${ads.length} properties matching your criteria:\n\n${lines}\n\nWhat would you like to do next? You can ask to see more, refine the search, or save these criteria.`
          : `I couldn't find any listings matching your specific criteria. Would you like to try a broader search or different terms?`;

        const response: Content = {
          text: responseText,
          actions: ['SEARCH_LISTINGS'],
          source: messageSource,
        };
        
        await callback(response);
        return response;
        
      } catch (error) {
        logger.error('Error fetching property listings initially:', error);
        // Fall through to ask for criteria if initial fetch fails
      }
    }
    
    // Default: Ask for criteria
    state.values.awaitingPropertyCriteria = true;
    const response: Content = {
      text: (
        'I can help you find property listings! Please provide some details about what you\'re looking for, such as:\n' +
        '- Area (e.g., Dubai Marina, JVC, Downtown)\n' +
        '- Property type (apartment, villa, etc.)\n' +
        '- Number of bedrooms\n' +
        '- Budget/price range\n\n' +
        'For example: "2 bedroom apartment in Dubai Marina under 1.5M AED"'.replace(/\\n/g, '\n')
      ),
      actions: ['SEARCH_LISTINGS'],
      source: messageSource,
    };
    
    await callback(response);
    return response;
  },
  
  examples: [
    [
      { 
        name: '{{user}}', 
        content: { 
          text: 'Show me 2 bedroom apartments in Dubai Marina under 1.5M' 
        } 
      },
      { 
        name: 'John', 
        content: { 
          text: 'Here are 3 properties matching your criteria:\n\n**1. Modern 2 Bedroom in Marina Heights – AED 1,450,000**\nhttps://www.propertyfinder.ae/en/buy/dubai/apartment-for-sale-dubai-marina-marina-heights-8654321.html\n\n**2. Spacious 2 BR with Sea View – AED 1,380,000**\nhttps://www.propertyfinder.ae/en/buy/dubai/apartment-for-sale-dubai-marina-marina-promenade-9876543.html\n\nWould you like to see more options, refine your search, or save these search criteria for later?',
          actions: ['SEARCH_LISTINGS'] 
        }
      },
    ],
    [
      { 
        name: '{{user}}', 
        content: { 
          text: 'Show me my saved property search' 
        } 
      },
      { 
        name: 'John', 
        content: { 
          text: 'Based on your saved preferences, here are 2 properties matching: 2 bedroom apartment in Dubai Marina under AED 1,500,000\n\n**1. Modern 2 Bedroom in Marina Heights – AED 1,450,000**\nhttps://www.propertyfinder.ae/en/buy/dubai/apartment-for-sale-dubai-marina-marina-heights-8654321.html\n\n**2. Spacious 2 BR with Sea View – AED 1,380,000**\nhttps://www.propertyfinder.ae/en/buy/dubai/apartment-for-sale-dubai-marina-marina-promenade-9876543.html\n\nWould you like to see more options, refine your search, or update your saved preferences?',
          actions: ['SEARCH_LISTINGS'] 
        }
      },
    ],
  ],
};

// Helper to fetch detailed property data from n8n webhook
async function fetchPropertyDetails(link: string): Promise<any | null> {
  try {
    logger.info(`[fetchPropertyDetails] Function called with link: ${link}`);
    const fetchModule = await import('node-fetch');
    const fetch = fetchModule.default;
    
    // Add retry logic with max 3 attempts
    const MAX_ATTEMPTS = 3;
    let lastError = null;
    
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        logger.info(`[fetchPropertyDetails] Attempt ${attempt}/${MAX_ATTEMPTS} to fetch from n8n webhook`);
        
        logger.info(`[fetchPropertyDetails] Attempting to fetch from n8n webhook: https://realyield.app.n8n.cloud/webhook/propertyfinder`);
        const res = await fetch('https://realyield.app.n8n.cloud/webhook/propertyfinder', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ link }),
        });
        
        if (res.status === 200) {
          const data = await res.json();
          logger.info(`[fetchPropertyDetails] Successfully received data from n8n`);
          return data;
        }
        
        if (!res.ok) {
          logger.error(`[fetchPropertyDetails] webhook error ${res.status}`);
          lastError = new Error(`Webhook error: ${res.status}`);
          
          // Wait before retry (exponential backoff)
          if (attempt < MAX_ATTEMPTS) {
            const backoffMs = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
            logger.info(`[fetchPropertyDetails] Waiting ${backoffMs}ms before retry`);
            await new Promise(resolve => setTimeout(resolve, backoffMs));
          }
          continue;
        }
        
        const data = await res.json();
        return data;
      } catch (attemptError) {
        logger.error(`[fetchPropertyDetails] Attempt ${attempt} failed:`, attemptError);
        lastError = attemptError;
        
        // Wait before retry (exponential backoff)
        if (attempt < MAX_ATTEMPTS) {
          const backoffMs = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
          logger.info(`[fetchPropertyDetails] Waiting ${backoffMs}ms before retry`);
          await new Promise(resolve => setTimeout(resolve, backoffMs));
        }
      }
    }
    
    // If we've reached here, all attempts failed
    logger.error(`[fetchPropertyDetails] All ${MAX_ATTEMPTS} attempts failed. Last error:`, lastError);
    throw lastError;
  } catch (err) {
    logger.error('fetchPropertyDetails failed', err);
    return null;
  }
}

// Function to test if n8n webhook is accessible
async function testPropertyLinkWebhook(): Promise<boolean> {
  try {
    logger.info('[testPropertyLinkWebhook] Testing connectivity to n8n webhook...');
    const fetchModule = await import('node-fetch');
    const fetch = fetchModule.default;
    
    // Send a test request with a dummy link
    const testLink = 'https://www.propertyfinder.ae/en/test-only-connectivity-check';
    const res = await fetch('https://realyield.app.n8n.cloud/webhook/propertyfinder', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ link: testLink }),
    });
    
    // We don't care about the response data, just that we can reach the endpoint
    logger.info(`[testPropertyLinkWebhook] Webhook test result: status=${res.status}`);
    return res.status < 500; // Any non-server error is considered "reachable"
  } catch (err) {
    logger.error('[testPropertyLinkWebhook] Failed to connect to n8n webhook:', err);
    return false;
  }
}

const analysePropertyLinkAction: Action = {
  name: 'ANALYSE_PROPERTY_LINK',
  similes: ['ANALYZE_AD', 'PROPERTY_ANALYSIS', 'AD_ANALYSIS'],
  description: 'Fetches a property advert and provides an investment or rental analysis.',

  validate: async (_rt, message) => {
    const text = message.content.text || '';
    logger.info(`[analysePropertyLinkAction.validate] Validating text: "${text}"`);
    
    // First do a simpler check for just the URL to catch raw URL pastes
    if (text.startsWith('https://') && text.includes('propertyfinder.ae')) {
      logger.info(`[analysePropertyLinkAction.validate] Direct URL match, returning true`);
      return true;
    }
    
    const propertyLinkRegex = /https?:\/\/(?:www\.)?propertyfinder\.ae\/[^\s]+/i;
    const isValid = propertyLinkRegex.test(text);
    logger.info(`[analysePropertyLinkAction.validate] Regex test result: ${isValid}`);
    return isValid;
  },

  handler: async (runtime, message, _state, _opts, callback) => {
    logger.info('[analysePropertyLinkAction.handler] Handler started.');
    const propertyLinkRegex = /https?:\/\/(?:www\.)?propertyfinder\.ae\/[^\s]+/i;
    const linkMatch = (message.content.text || '').match(propertyLinkRegex);

    if (!linkMatch) {
      logger.warn('[analysePropertyLinkAction.handler] No link match found, exiting handler.');
      return null;
    }
    const link = linkMatch[0];
    logger.info(`[analysePropertyLinkAction.handler] Link extracted: ${link}`);

    logger.info(`[analysePropertyLinkAction.handler] Attempting to call fetchPropertyDetails with link: ${link}`);
    const details = await fetchPropertyDetails(link);

    if (!details) {
      logger.warn('[analysePropertyLinkAction.handler] fetchPropertyDetails returned null.');
      await callback({ 
        text: 'I had trouble retrieving that listing. Please try again later.',
        actions: ['ANALYSE_PROPERTY_LINK']
      });
      return null;
    }

    const isRent = /\/rent\//.test(link);

    // Common fields
    const price = details.price;
    const size = details.size;
    const ppsqft = size ? (price / size).toFixed(0) : 'N/A';

    let analysis = `**${details.title}**\n`;
    analysis += `${isRent ? 'Annual Rent' : 'Asking Price'}: **AED ${price.toLocaleString()}**\n`;
    if (size) analysis += `Size: **${size.toLocaleString()} sqft** (AED ${ppsqft}/sqft)\n`;
    analysis += `Bedrooms/Bathrooms: **${details.bedrooms} / ${details.bathrooms}**\n`;
    analysis += `Location: ${details.location}\n`;

    if (isRent) {
      // Simple rent-focused insight
      analysis += `\n__*Rental Insights*__\n`;
      analysis += `• Approx. rent per sqft: **AED ${ppsqft}**\n`;
      analysis += `• Furnishing: ${details.furnishing === 'YES' ? 'Furnished' : 'Unfurnished'}\n`;
      analysis += `• Key amenities: ${details.amenities?.slice(0,5).join(', ') || 'N/A'}\n`;
      analysis += `\n*Recommendation:* Ensure the contract clarifies maintenance responsibilities and cheque schedule. Would you like help arranging a viewing or finding similar options?`;
    } else {
      // Purchase analysis (basic)
      analysis += `\n__*Investment Snapshot*__\n`;
      analysis += `• Price per sqft: **AED ${ppsqft}** (compare to area avg)\n`;
      analysis += `• Estimated gross yield: _coming soon_\n`;
      analysis += `\n*Recommendation:* Review service charges and potential rental income to confirm net yield. Let me know if you want a deeper investment breakdown.`;
    }

    const response: Content = {
      text: `${analysis}\n\n<${link}>`,
      actions: ['ANALYSE_PROPERTY_LINK'],
      attachments: details.image ? [{ type: 'image', url: details.image }] : undefined,
    } as any;

    await callback(response);
    return response;
  },
};

// Debug action to manually test property analysis with a hardcoded URL
const debugPropertyAction: Action = {
  name: 'DEBUG_PROPERTY',
  similes: ['TEST_PROPERTY', 'FETCH_TEST_PROPERTY'],
  description: 'Debug utility to test property fetching with a fixed URL',

  validate: async (_rt, message) => {
    const text = (message.content.text || '').toLowerCase();
    return text.includes('debug property') || text.includes('test property link');
  },

  handler: async (runtime, message, _state, _opts, callback) => {
    logger.info('[debugPropertyAction.handler] Handler started.');
    
    // Fixed test URL - this is the one from the user's example
    const testUrl = 'https://www.propertyfinder.ae/en/plp/rent/apartment-for-rent-dubai-business-bay-upside-living-14214294.html';
    logger.info(`[debugPropertyAction.handler] Using test URL: ${testUrl}`);
    
    await callback({ 
      text: `I'll debug the property link analysis with a test URL: ${testUrl}`,
      actions: ['DEBUG_PROPERTY'] 
    });
    
    logger.info(`[debugPropertyAction.handler] Calling fetchPropertyDetails with test URL`);
    const details = await fetchPropertyDetails(testUrl);
    
    if (!details) {
      logger.warn('[debugPropertyAction.handler] fetchPropertyDetails returned null.');
      await callback({ 
        text: `DEBUG RESULT: Failed to fetch property details from n8n webhook.`,
        actions: ['DEBUG_PROPERTY']
      });
      return null;
    }
    
    // Successfully got details
    logger.info(`[debugPropertyAction.handler] Successfully received property details: ${JSON.stringify(details)}`);
    
    await callback({ 
      text: `DEBUG RESULT: Successfully fetched property details!\n\nTitle: ${details.title}\nPrice: ${details.price}\nSize: ${details.size}\nBedrooms: ${details.bedrooms}`,
      actions: ['DEBUG_PROPERTY']
    });
    
    return null;
  },
};

export class StarterService extends Service {
  static serviceType = 'starter';
  capabilityDescription =
    'This is a starter service which is attached to the agent through the starter plugin.';
  constructor(protected runtime: IAgentRuntime) {
    super(runtime);
  }

  static async start(runtime: IAgentRuntime) {
    logger.info('*** Starting starter service ***');
    const service = new StarterService(runtime);
    return service;
  }

  static async stop(runtime: IAgentRuntime) {
    logger.info('*** Stopping starter service ***');
    // get the service from the runtime
    const service = runtime.getService(StarterService.serviceType);
    if (!service) {
      throw new Error('Starter service not found');
    }
    service.stop();
  }

  async stop() {
    logger.info('*** Stopping starter service instance ***');
  }
}

const plugin: Plugin = {
  name: 'starter',
  description: 'A starter plugin for Eliza',
  config: {
    EXAMPLE_PLUGIN_VARIABLE: process.env.EXAMPLE_PLUGIN_VARIABLE,
  },
  async init(config: Record<string, string>) {
    logger.info('*** Initializing starter plugin ***');
    try {
      const validatedConfig = await configSchema.parseAsync(config);

      // Set all environment variables at once
      for (const [key, value] of Object.entries(validatedConfig)) {
        if (value) process.env[key] = value;
      }
      
      // Test n8n webhook connectivity during initialization
      const webhookIsAccessible = await testPropertyLinkWebhook();
      logger.info(`[init] n8n webhook for property analysis is ${webhookIsAccessible ? 'accessible' : 'NOT ACCESSIBLE'}`);
      if (!webhookIsAccessible) {
        logger.warn('[init] WARNING: Property analysis may not work due to connectivity issues with n8n webhook');
      }
      
      // Initialize database tables
      try {
        // Using any to bypass type checks for sql property
        const runtime = this.runtime as any;
        if (runtime?.sql) {
          // Create preferences table if it doesn't exist
          await runtime.sql.query(`
            CREATE TABLE IF NOT EXISTS preferences (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              user_id TEXT NOT NULL,
              area TEXT,
              property_type TEXT,
              bedrooms TEXT,
              max_price INTEGER,
              min_price INTEGER,
              yield_floor REAL,
              furnished INTEGER,
              last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
              UNIQUE(user_id)
            )
          `);
          
          // Create search_logs table if it doesn't exist
          await runtime.sql.query(`
            CREATE TABLE IF NOT EXISTS search_logs (
              search_id TEXT PRIMARY KEY,
              user_id TEXT NOT NULL,
              timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
              criteria_json TEXT,
              listings_returned INTEGER,
              CONSTRAINT idx_user UNIQUE (user_id, timestamp)
            )
          `);
          
          logger.info('Database tables initialized');
        }
      } catch (error) {
        logger.error('Error initializing database tables:', error);
      }
    } catch (error) {
      if (error instanceof z.ZodError) {
        throw new Error(
          `Invalid plugin configuration: ${error.errors.map((e) => e.message).join(', ')}`
        );
      }
      throw error;
    }
  },
  models: {
    [ModelType.TEXT_SMALL]: async (
      _runtime,
      { prompt, stopSequences = [] }: GenerateTextParams
    ) => {
      return 'Never gonna give you up, never gonna let you down, never gonna run around and desert you...';
    },
    [ModelType.TEXT_LARGE]: async (
      _runtime,
      {
        prompt,
        stopSequences = [],
        maxTokens = 8192,
        temperature = 0.7,
        frequencyPenalty = 0.7,
        presencePenalty = 0.7,
      }: GenerateTextParams
    ) => {
      return 'Never gonna make you cry, never gonna say goodbye, never gonna tell a lie and hurt you...';
    },
  },
  tests: [starterTestSuite],
  routes: [
    {
      name: 'HELLO_WORLD_ROUTE',
      path: '/helloworld',
      type: 'GET',
      handler: async (_req: any, res: any) => {
        res.json({ message: 'Hello World!' });
      },
    },
  ],
  events: {
    MESSAGE_RECEIVED: [
      async (params) => {
        logger.info('MESSAGE_RECEIVED event received');
        // print the keys
        logger.info(Object.keys(params));
      },
    ],
    VOICE_MESSAGE_RECEIVED: [
      async (params) => {
        logger.info('VOICE_MESSAGE_RECEIVED event received');
        // print the keys
        logger.info(Object.keys(params));
      },
    ],
    WORLD_CONNECTED: [
      async (params) => {
        logger.info('WORLD_CONNECTED event received');
        // print the keys
        logger.info(Object.keys(params));
      },
    ],
    WORLD_JOINED: [
      async (params) => {
        logger.info('WORLD_JOINED event received');
        // print the keys
        logger.info(Object.keys(params));
      },
    ],
  },
  services: [StarterService],
  actions: [analysePropertyLinkAction, searchListingsAction, debugPropertyAction, helloWorldAction],
  providers: [helloWorldProvider, preferencesProvider],
};

export default plugin;
