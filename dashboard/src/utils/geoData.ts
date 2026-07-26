export interface CityGeo {
  name: string;
  lat: number;
  lng: number;
}

export interface StateGeo {
  name: string;
  lat: number;
  lng: number;
  cities: CityGeo[];
}

export interface CountryGeo {
  name: string;
  code: string;
  lat: number;
  lng: number;
  zoom: number;
  states: StateGeo[];
}

export const COUNTRIES_DATA: CountryGeo[] = [
  {
    name: 'India',
    code: 'IN',
    lat: 20.5937,
    lng: 78.9629,
    zoom: 5,
    states: [
      {
        name: 'Gujarat',
        lat: 22.2587,
        lng: 71.1924,
        cities: [
          { name: 'Ahmedabad', lat: 23.0225, lng: 72.5714 },
          { name: 'Surat', lat: 21.1702, lng: 72.8311 },
          { name: 'Vadodara', lat: 22.3072, lng: 73.1812 },
          { name: 'Rajkot', lat: 22.3039, lng: 70.8022 },
          { name: 'Bhavnagar', lat: 21.7645, lng: 72.1519 },
          { name: 'Jamnagar', lat: 22.4707, lng: 70.0577 },
          { name: 'Gandhinagar', lat: 23.2156, lng: 72.6369 },
          { name: 'Junagadh', lat: 21.5222, lng: 70.4579 },
          { name: 'Anand', lat: 22.5645, lng: 72.9289 },
          { name: 'Bharuch', lat: 21.7051, lng: 72.9959 },
        ],
      },
      {
        name: 'Maharashtra',
        lat: 19.7515,
        lng: 75.7139,
        cities: [
          { name: 'Mumbai', lat: 19.076, lng: 72.8777 },
          { name: 'Pune', lat: 18.5204, lng: 73.8567 },
          { name: 'Nagpur', lat: 21.1458, lng: 79.0882 },
          { name: 'Thane', lat: 19.2183, lng: 72.9781 },
          { name: 'Nashik', lat: 20.0059, lng: 73.7898 },
          { name: 'Chhatrapati Sambhajinagar', lat: 19.8762, lng: 75.3433 },
          { name: 'Solapur', lat: 17.6599, lng: 75.9064 },
        ],
      },
      {
        name: 'Delhi NCR',
        lat: 28.7041,
        lng: 77.1025,
        cities: [
          { name: 'New Delhi', lat: 28.6139, lng: 77.209 },
          { name: 'North Delhi', lat: 28.75, lng: 77.1167 },
          { name: 'South Delhi', lat: 28.5355, lng: 77.241 },
          { name: 'East Delhi', lat: 28.628, lng: 77.295 },
          { name: 'Noida', lat: 28.5355, lng: 77.391 },
          { name: 'Gurugram', lat: 28.4595, lng: 77.0266 },
        ],
      },
      {
        name: 'Uttar Pradesh',
        lat: 26.8467,
        lng: 80.9462,
        cities: [
          { name: 'Lucknow', lat: 26.8467, lng: 80.9462 },
          { name: 'Kanpur', lat: 26.4499, lng: 80.3319 },
          { name: 'Varanasi', lat: 25.3176, lng: 82.9739 },
          { name: 'Agra', lat: 27.1767, lng: 78.0081 },
          { name: 'Prayagraj', lat: 25.4358, lng: 81.8463 },
          { name: 'Ghaziabad', lat: 28.6692, lng: 77.4538 },
        ],
      },
      {
        name: 'Punjab',
        lat: 31.1471,
        lng: 75.3412,
        cities: [
          { name: 'Ludhiana', lat: 30.901, lng: 75.8573 },
          { name: 'Amritsar', lat: 31.634, lng: 74.8723 },
          { name: 'Jalandhar', lat: 31.326, lng: 75.5762 },
          { name: 'Patiala', lat: 30.3398, lng: 76.3869 },
          { name: 'Mohali', lat: 30.7046, lng: 76.7179 },
        ],
      },
      {
        name: 'West Bengal',
        lat: 22.9868,
        lng: 87.855,
        cities: [
          { name: 'Kolkata', lat: 22.5726, lng: 88.3639 },
          { name: 'Howrah', lat: 22.5958, lng: 88.2636 },
          { name: 'Durgapur', lat: 23.5204, lng: 87.3119 },
          { name: 'Siliguri', lat: 26.7271, lng: 88.3953 },
          { name: 'Asansol', lat: 23.6889, lng: 86.9661 },
        ],
      },
      {
        name: 'Karnataka',
        lat: 15.3173,
        lng: 75.7139,
        cities: [
          { name: 'Bengaluru', lat: 12.9716, lng: 77.5946 },
          { name: 'Mysuru', lat: 12.2958, lng: 76.6394 },
          { name: 'Hubballi', lat: 15.3647, lng: 75.124 },
          { name: 'Mangaluru', lat: 12.9141, lng: 74.856 },
          { name: 'Belagavi', lat: 15.8497, lng: 74.4977 },
        ],
      },
      {
        name: 'Tamil Nadu',
        lat: 11.1271,
        lng: 78.6569,
        cities: [
          { name: 'Chennai', lat: 13.0827, lng: 80.2707 },
          { name: 'Coimbatore', lat: 11.0168, lng: 76.9558 },
          { name: 'Madurai', lat: 9.9252, lng: 78.1198 },
          { name: 'Tiruchirappalli', lat: 10.7905, lng: 78.7047 },
          { name: 'Salem', lat: 11.6643, lng: 78.146 },
        ],
      },
    ],
  },
  {
    name: 'United States',
    code: 'US',
    lat: 37.0902,
    lng: -95.7129,
    zoom: 4,
    states: [
      {
        name: 'California',
        lat: 36.7783,
        lng: -119.4179,
        cities: [
          { name: 'Los Angeles', lat: 34.0522, lng: -118.2437 },
          { name: 'San Francisco', lat: 37.7749, lng: -122.4194 },
          { name: 'San Diego', lat: 32.7157, lng: -117.1611 },
          { name: 'San Jose', lat: 37.3382, lng: -121.8863 },
          { name: 'Sacramento', lat: 38.5816, lng: -121.4944 },
        ],
      },
      {
        name: 'New York',
        lat: 40.7128,
        lng: -74.006,
        cities: [
          { name: 'New York City', lat: 40.7128, lng: -74.006 },
          { name: 'Buffalo', lat: 42.8864, lng: -78.8784 },
          { name: 'Rochester', lat: 43.1566, lng: -77.6088 },
          { name: 'Albany', lat: 42.6526, lng: -73.7562 },
        ],
      },
      {
        name: 'Texas',
        lat: 31.9686,
        lng: -99.9018,
        cities: [
          { name: 'Houston', lat: 29.7604, lng: -95.3698 },
          { name: 'Dallas', lat: 32.7767, lng: -96.797 },
          { name: 'Austin', lat: 30.2672, lng: -97.7431 },
          { name: 'San Antonio', lat: 29.4241, lng: -98.4936 },
        ],
      },
      {
        name: 'Florida',
        lat: 27.6648,
        lng: -81.5158,
        cities: [
          { name: 'Miami', lat: 25.7617, lng: -80.1918 },
          { name: 'Orlando', lat: 28.5383, lng: -81.3792 },
          { name: 'Tampa', lat: 27.9506, lng: -82.4572 },
          { name: 'Jacksonville', lat: 30.3322, lng: -81.6557 },
        ],
      },
    ],
  },
  {
    name: 'United Kingdom',
    code: 'GB',
    lat: 55.3781,
    lng: -3.436,
    zoom: 5,
    states: [
      {
        name: 'England',
        lat: 52.3555,
        lng: -1.1743,
        cities: [
          { name: 'London', lat: 51.5074, lng: -0.1278 },
          { name: 'Manchester', lat: 53.4808, lng: -2.2426 },
          { name: 'Birmingham', lat: 52.4862, lng: -1.8904 },
          { name: 'Leeds', lat: 53.8008, lng: -1.5491 },
          { name: 'Liverpool', lat: 53.4084, lng: -2.9916 },
        ],
      },
      {
        name: 'Scotland',
        lat: 56.4907,
        lng: -4.2026,
        cities: [
          { name: 'Edinburgh', lat: 55.9533, lng: -3.1883 },
          { name: 'Glasgow', lat: 55.8642, lng: -4.2518 },
          { name: 'Aberdeen', lat: 57.1497, lng: -2.0943 },
        ],
      },
    ],
  },
  {
    name: 'United Arab Emirates',
    code: 'AE',
    lat: 23.4241,
    lng: 53.8478,
    zoom: 7,
    states: [
      {
        name: 'Dubai',
        lat: 25.2048,
        lng: 55.2708,
        cities: [
          { name: 'Dubai City', lat: 25.2048, lng: 55.2708 },
          { name: 'Deira', lat: 25.2697, lng: 55.3095 },
          { name: 'Dubai Marina', lat: 25.0772, lng: 55.1332 },
        ],
      },
      {
        name: 'Abu Dhabi',
        lat: 24.4539,
        lng: 54.3773,
        cities: [
          { name: 'Abu Dhabi City', lat: 24.4539, lng: 54.3773 },
          { name: 'Al Ain', lat: 24.2075, lng: 55.7447 },
        ],
      },
    ],
  },
  {
    name: 'Canada',
    code: 'CA',
    lat: 56.1304,
    lng: -106.3468,
    zoom: 4,
    states: [
      {
        name: 'Ontario',
        lat: 51.2538,
        lng: -85.3232,
        cities: [
          { name: 'Toronto', lat: 43.6532, lng: -79.3832 },
          { name: 'Ottawa', lat: 45.4215, lng: -75.6972 },
          { name: 'Hamilton', lat: 43.2557, lng: -79.8711 },
        ],
      },
      {
        name: 'British Columbia',
        lat: 53.7267,
        lng: -127.6476,
        cities: [
          { name: 'Vancouver', lat: 49.2827, lng: -123.1207 },
          { name: 'Victoria', lat: 48.4284, lng: -123.3656 },
          { name: 'Surrey', lat: 49.1913, lng: -122.849 },
        ],
      },
    ],
  },
];

export function getCountryByName(name: string): CountryGeo | undefined {
  return COUNTRIES_DATA.find((c) => c.name.toLowerCase() === name.toLowerCase());
}

export function getStateByName(countryName: string, stateName: string): StateGeo | undefined {
  const country = getCountryByName(countryName);
  return country?.states.find((s) => s.name.toLowerCase() === stateName.toLowerCase());
}

export function getCityByName(countryName: string, stateName: string, cityName: string): CityGeo | undefined {
  const state = getStateByName(countryName, stateName);
  return state?.cities.find((c) => c.name.toLowerCase() === cityName.toLowerCase());
}
