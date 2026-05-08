export const ANGEL_ONE_URLS = {
  BASE_URL: 'https://apiconnect.angelone.in',
  LOGIN: '/rest/auth/angelbroking/user/v1/loginByPassword',
  LTP_DATA: '/rest/secure/angelbroking/order/v1/getLtpData',
  MARKET_DATA: '/rest/secure/angelbroking/marketData/v1/getQuote',
  OPTION_GREEK: '/rest/secure/angelbroking/marketData/v1/optionGreek',
  PLACE_ORDER: '/rest/secure/angelbroking/order/v1/placeOrder',
  MODIFY_ORDER: '/rest/secure/angelbroking/order/v1/modifyOrder',
  CANCEL_ORDER: '/rest/secure/angelbroking/order/v1/cancelOrder',
  ORDER_BOOK: '/rest/secure/angelbroking/order/v1/getOrderBook',
};

export const SCRIP_MASTER_URL =
  'https://margincalculator.angelbroking.com/OpenAPI_File/files/OpenAPIScripMaster.json';

export const TIMING = {
  MARKET_OPEN: '09:15',
  SCAN_TIME: '10:30',
  SQUARE_OFF_TIME: '15:20',
  MARKET_CLOSE: '15:30',
};

export const NIFTY_50_TOKENS = [
  '26000', // NIFTY
  '3456', // ADANIENT
  '15083', // ADANIPORTS
  '11536', // APOLLOHOSP
  '212', // ASHOKLEY
  '33', // ASIANPAINT
  '5900', // AXISBANK
  '16669', // BAJAJ-AUTO
  '16675', // BAJAJFINSV
  '317', // BAJFINANCE
  '11359', // BHARTIARTL
  '11703', // BPCL
  '522', // BRITANNIA
  '694', // CIPLA
  '724', // COALINDIA
  '10940', // DIVISLAB
  '881', // DRREDDY
  '910', // EICHERMOT
  '1232', // GRASIM
  '7229', // HCLTECH
  '1333', // HDFCBANK
  '1476', // HDFCLIFE
  '1348', // HEROMOTOCO
  '1363', // HINDALCO
  '1394', // HINDUNILVR
  '4963', // ICICIBANK
  '11262', // INDUSINDBK
  '1594', // INFY
  '1617', // ITC
  '1660', // JSWSTEEL
  '11705', // KOTAKBANK
  '11483', // LT
  '11532', // LTIM
  '2031', // M&M
  '14356', // MARUTI
  '11532', // NESTLEIND
  '11630', // NTPC
  '2475', // ONGC
  '11485', // POWERGRID
  '2885', // RELIANCE
  '11532', // SBILIFE
  '3045', // SBIN
  '3101', // SUNPHARMA
  '3225', // TATACONSUM
  '3405', // TATAMOTORS
  '3426', // TATASTEEL
  '11536', // TCS
  '11532', // TECHM
  '3506', // TITAN
  '11532', // ULTRACEMCO
  '3787', // WIPRO
];
