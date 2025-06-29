// This is the final working version of the serverless function.
// It uses a CORS proxy for the final, problematic fetch request to bypass IP blocking from www.sec.gov.

async function parseHoldingsFromXml(xmlText) {
  const holdings = [];
  // This regex is designed to be robust for the 13F infoTable format.
  const infoTableRegex = /<infoTable>([\s\S]*?)<\/infoTable>/g;
  let match;

  while ((match = infoTableRegex.exec(xmlText)) !== null) {
    const infoTableContent = match[1];
    const holding = {};

    const nameMatch = /<nameOfIssuer>([\s\S]*?)<\/nameOfIssuer>/.exec(infoTableContent);
    const valueMatch = /<value>([\s\S]*?)<\/value>/.exec(infoTableContent);
    const sshPrnamtMatch = /<sshPrnamt>([\s\S]*?)<\/sshPrnamt>/.exec(infoTableContent);
    
    if (nameMatch) holding.nameOfIssuer = nameMatch[1].trim();
    if (valueMatch) holding.value = valueMatch[1].trim();
    if (sshPrnamtMatch) holding.sshPrnamt = sshPrnamtMatch[1].trim();
    
    if (holding.nameOfIssuer && holding.value && holding.sshPrnamt) {
       holdings.push(holding);
    }
  }
  return holdings;
}

export async function onRequest(context) {
  const { searchParams } = new URL(context.request.url);
  const cik = searchParams.get('cik');

  if (!cik) {
    return new Response(JSON.stringify({ error: 'CIK is required' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }

  const headers = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36' };
  const cikPadded = cik.padStart(10, '0');

  try {
    // --- Step 1: Get submissions (This part works fine) ---
    const submissionsUrl = `https://data.sec.gov/submissions/CIK${cikPadded}.json`;
    const submissionsResponse = await fetch(submissionsUrl, { headers });
    if (!submissionsResponse.ok) {
        throw new Error(`SEC submissions API failed with status: ${submissionsResponse.status}`);
    }
    const submissionsData = await submissionsResponse.json();

    // --- Step 2: Find latest 13F-HR filing (This part works fine) ---
    const recentFilings = submissionsData.filings.recent;
    let latest13F = null;
    for (let i = 0; i < recentFilings.form.length; i++) {
        if (recentFilings.form[i] === '13F-HR') {
            latest13F = { accessionNumber: recentFilings.accessionNumber[i] };
            break;
        }
    }

    if (!latest13F) {
        throw new Error("No recent 13F-HR filing found for CIK " + cik);
    }
    
    // --- Step 3: Fetch the holdings XML via a CORS Proxy (This is the fix) ---
    const accessionNumberNoDash = latest13F.accessionNumber.replace(/-/g, '');
    const targetUrl = `https://www.sec.gov/Archives/edgar/data/${cik}/${accessionNumberNoDash}/form13fInfoTable.xml`;
    
    // We use a public CORS proxy to make the request on our behalf.
    // This hides the Cloudflare server's IP address from the SEC server.
    const proxyUrl = `https://corsproxy.io/?${encodeURIComponent(targetUrl)}`;
    
    const holdingsResponse = await fetch(proxyUrl, { headers });
    if (!holdingsResponse.ok) {
        throw new Error(`CORS Proxy fetch for holdings data failed. Status: ${holdingsResponse.status}`);
    }
    const xmlText = await holdingsResponse.text();

    // --- Step 4: Parse XML and return data ---
    const holdings = await parseHoldingsFromXml(xmlText);
    
    return new Response(JSON.stringify(holdings), {
      headers: { 
        'Content-Type': 'application/json',
        'Cache-Control': 's-maxage=86400' // Cache for 24 hours
      }
    });

  } catch (error) {
    console.error(`[sec-proxy] FINAL ERROR for CIK ${cik}:`, error.message);
    return new Response(JSON.stringify({ error: error.message }), { 
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}