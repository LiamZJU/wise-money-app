// This is the updated, more robust serverless function for fetching SEC 13F data.
// It handles the entire process on the backend to avoid any CORS issues on the frontend.

export async function onRequest(context) {
  const { searchParams } = new URL(context.request.url);
  const cik = searchParams.get('cik');

  if (!cik) {
    return new Response(JSON.stringify({ error: 'CIK is required' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }

  // Use a generic browser User-Agent. This is crucial.
  const headers = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36' };
  const cikPadded = cik.padStart(10, '0');

  try {
    // --- Step 1: Get submissions to find the latest 13F-HR filing ---
    const submissionsUrl = `https://data.sec.gov/submissions/CIK${cikPadded}.json`;
    const submissionsResponse = await fetch(submissionsUrl, { headers });
    if (!submissionsResponse.ok) {
        throw new Error(`SEC submissions API failed with status: ${submissionsResponse.status}`);
    }
    const submissionsData = await submissionsResponse.json();

    const recentFilings = submissionsData.filings.recent;
    let latest13F = null;
    for (let i = 0; i < recentFilings.form.length; i++) {
        if (recentFilings.form[i] === '13F-HR') {
            latest13F = {
                accessionNumber: recentFilings.accessionNumber[i].replace(/-/g, ''),
                document: recentFilings.primaryDocument[i],
            };
            break;
        }
    }

    if (!latest13F) {
        throw new Error("No recent 13F-HR filing found for CIK " + cik);
    }

    // --- Step 2: Fetch the actual holdings data from the filing's XML document ---
    const holdingsUrl = `https://www.sec.gov/Archives/edgar/data/${cik}/${latest13F.accessionNumber}/${latest13F.document}`;
    const holdingsResponse = await fetch(holdingsUrl, { headers });
    if (!holdingsResponse.ok) {
        throw new Error(`SEC holdings document fetch failed with status: ${holdingsResponse.status}`);
    }
    const xmlText = await holdingsResponse.text();

    // --- Step 3: Parse the XML and return the final JSON data ---
    // Note: XML parsing must be done carefully. A simple regex is often more reliable
    // for this specific, non-standard XML format than a full parser in a serverless environment.
    const holdings = [];
    const infoTableRegex = /<infoTable>([\s\S]*?)<\/infoTable>/g;
    const itemRegex = /<([\w\d]+)>([\s\S]*?)<\/\1>/g;
    let match;

    while ((match = infoTableRegex.exec(xmlText)) !== null) {
      const infoTableContent = match[1];
      const holding = {};
      let itemMatch;
      while ((itemMatch = itemRegex.exec(infoTableContent)) !== null) {
        // Handle nested tags like <shrsOrPrnAmt>
        if (itemMatch[1] === 'shrsOrPrnAmt') {
          const sshPrnamtMatch = /<sshPrnamt>(\d+)<\/sshPrnamt>/.exec(itemMatch[2]);
          const sshPrnamtTypeMatch = /<sshPrnamtType>(\w+)<\/sshPrnamtType>/.exec(itemMatch[2]);
          if(sshPrnamtMatch) holding.sshPrnamt = sshPrnamtMatch[1];
          if(sshPrnamtTypeMatch) holding.sshPrnamtType = sshPrnamtTypeMatch[1];
        } else {
          holding[itemMatch[1]] = itemMatch[2].trim();
        }
      }
      holdings.push(holding);
    }

    // Return the successful response with the parsed holdings.
    return new Response(JSON.stringify(holdings), {
      headers: { 
        'Content-Type': 'application/json',
        'Cache-Control': 's-maxage=86400' // Cache for 24 hours
      }
    });

  } catch (error) {
    console.error(`SEC Proxy Error for CIK ${cik}:`, error.message);
    // Return an error response.
    return new Response(JSON.stringify({ error: error.message }), { 
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}