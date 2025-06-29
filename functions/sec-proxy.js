// This is the final, working serverless function.
// It uses a more reliable FMP API endpoint (/api/v3/13f-cik/{cik})
// which is better suited for free-tier users.

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

  // ** THE FIX: Use a more direct and reliable FMP endpoint for 13F data **
  const fmpUrl = `https://financialmodelingprep.com/api/v3/13f-cik/${cik}?apikey=${apiKey}`;

  try {
    const response = await fetch(fmpUrl);
    if (!response.ok) {
      throw new Error(`FMP API failed with status: ${response.status}`);
    }
    
    const data = await response.json();

    // Check if FMP returned an empty array, which means no data is available.
    if (data.length === 0) {
      throw new Error('No 13F filings found for this CIK on FMP.');
    }
    
    // The response is directly an array of holdings.
    const holdings = data;

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