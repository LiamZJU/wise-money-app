// This is the debug-enhanced serverless function.
// It adds detailed logging at each step to help diagnose deployment issues.

async function parseHoldingsFromXml(xmlText) {
  const holdings = [];
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
  console.log(`[sec-proxy] Received request for CIK: ${cik}`);

  if (!cik) {
    return new Response(JSON.stringify({ error: 'CIK is required' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }

  const headers = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36' };
  const cikPadded = cik.padStart(10, '0');

  try {
    // --- Step 1: Get submissions ---
    const submissionsUrl = `https://data.sec.gov/submissions/CIK${cikPadded}.json`;
    console.log(`[sec-proxy] Fetching submissions from: ${submissionsUrl}`);
    const submissionsResponse = await fetch(submissionsUrl, { headers });
    console.log(`[sec-proxy] Submissions response status: ${submissionsResponse.status}`);
    
    if (!submissionsResponse.ok) {
        throw new Error(`SEC submissions API failed with status: ${submissionsResponse.status}`);
    }
    const submissionsData = await submissionsResponse.json();
    console.log(`[sec-proxy] Successfully fetched submissions data.`);

    // --- Step 2: Find latest 13F-HR filing ---
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
    console.log(`[sec-proxy] Found latest 13F: ${latest13F.accessionNumber}`);

    // --- Step 3: Fetch the holdings XML ---
    const accessionNumberNoDash = latest13F.accessionNumber.replace(/-/g, '');
    const filingUrl = `https://www.sec.gov/Archives/edgar/data/${cik}/${accessionNumberNoDash}/form13fInfoTable.xml`;
    console.log(`[sec-proxy] Fetching holdings from: ${filingUrl}`);

    const holdingsResponse = await fetch(filingUrl, { headers });
    console.log(`[sec-proxy] Holdings response status: ${holdingsResponse.status}`);
    
    if (!holdingsResponse.ok) {
        throw new Error(`Could not find holdings data. Status: ${holdingsResponse.status}`);
    }
    const xmlText = await holdingsResponse.text();
    console.log(`[sec-proxy] Successfully fetched holdings XML. Parsing...`);

    // --- Step 4: Parse XML and return data ---
    const holdings = await parseHoldingsFromXml(xmlText);
    console.log(`[sec-proxy] Parsed ${holdings.length} holdings. Request successful.`);
    
    return new Response(JSON.stringify(holdings), {
      headers: { 
        'Content-Type': 'application/json',
        'Cache-Control': 's-maxage=86400'
      }
    });

  } catch (error) {
    console.error(`[sec-proxy] CRITICAL ERROR for CIK ${cik}:`, error.message);
    return new Response(JSON.stringify({ error: error.message }), { 
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}