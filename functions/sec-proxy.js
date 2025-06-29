// This is the final, working serverless function.
// It uses the Financial Modeling Prep (FMP) API to get 13F holdings data reliably.

export async function onRequest(context) {
  // Get the CIK from the request URL
  const { searchParams } = new URL(context.request.url);
  const cik = searchParams.get('cik');

  // Get the API key from Cloudflare's environment variables
  const apiKey = context.env.FMP_API_KEY;

  if (!cik) {
    return new Response(JSON.stringify({ error: 'CIK is required' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }

  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'API key is not configured' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }

  // Construct the FMP API URL
  const fmpUrl = `https://financialmodelingprep.com/api/v3/form-13f/list?cik=${cik}&apikey=${apiKey}`;

  try {
    const response = await fetch(fmpUrl);
    if (!response.ok) {
      throw new Error(`FMP API failed with status: ${response.status}`);
    }
    
    const data = await response.json();

    // FMP returns an array of filings. We usually want the most recent one.
    if (data.length === 0) {
      throw new Error('No 13F filings found for this CIK on FMP.');
    }
    
    // The first item is the most recent filing. Its `table` property contains the holdings.
    const holdings = data[0].table;

    return new Response(JSON.stringify(holdings), {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 's-maxage=86400' // Cache for 24 hours
      }
    });

  } catch (error) {
    console.error(`[sec-proxy] FMP Fetch Error for CIK ${cik}:`, error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}