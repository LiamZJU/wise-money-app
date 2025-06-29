export async function onRequest(context) {
    // context.request contains the request object.
    // context.env contains environment variables.
    // context.next is a function to call the next middleware.
    
    // Get the search parameters from the URL.
    const { searchParams } = new URL(context.request.url);
    const cik = searchParams.get('cik');
  
    // CIK is required.
    if (!cik) {
      return new Response(JSON.stringify({ error: 'CIK is required' }), { 
        status: 400, 
        headers: { 'Content-Type': 'application/json' } 
      });
    }
  
    // SEC requires a specific User-Agent format.
    const headers = { 'User-Agent': 'WiseMoney App contact@example.com' };
    
    // The CIK must be padded with leading zeros to 10 digits.
    const cikPadded = cik.padStart(10, '0');
    const submissionsUrl = `https://data.sec.gov/submissions/CIK${cikPadded}.json`;
  
    try {
      const response = await fetch(submissionsUrl, { headers });
      if (!response.ok) {
          throw new Error(`Failed to fetch from SEC API with status: ${response.status}`);
      }
      const data = await response.json();
      
      // Return the successful response from the SEC API.
      return new Response(JSON.stringify(data), {
        headers: { 
          'Content-Type': 'application/json',
          'Cache-Control': 's-maxage=3600' // Cache for 1 hour
        }
      });
    } catch (error) {
      console.error('SEC Proxy Error:', error);
      // Return an error response.
      return new Response(JSON.stringify({ error: error.message }), { 
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }  