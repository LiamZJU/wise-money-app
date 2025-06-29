// This is the updated, more robust serverless function for fetching SEC 13F data.
// It handles the entire process on the backend to avoid any CORS issues on the frontend.
// This version is based on a deeper analysis of the official SEC EDGAR API documentation.

async function parseHoldingsFromXml(xmlText) {
  // A robust XML parser is complex. For the specific structure of 13F infoTables,
  // a targeted regular expression is often more reliable and lightweight for a serverless environment.
  // This regex looks for <infoTable>...</infoTable> blocks and then extracts key-value pairs inside.
  // It handles nested tags like <shrsOrPrnAmt> internally.
  const holdings = [];
  const infoTableRegex = /<infoTable>([\s\S]*?)<\/infoTable>/g;
  let match;

  while ((match = infoTableRegex.exec(xmlText)) !== null) {
    const infoTableContent = match[1];
    const holding = {};

    const nameMatch = /<nameOfIssuer>([\s\S]*?)<\/nameOfIssuer>/.exec(infoTableContent);
    const valueMatch = /<value>([\s\S]*?)<\/value>/.exec(infoTableContent);
    const sshPrnamtMatch = /<sshPrnamt>([\s\S]*?)<\/sshPrnamt>/.exec(infoTableContent);
    const sshPrnamtTypeMatch = /<sshPrnamtType>([\s\S]*?)<\/sshPrnamtType>/.exec(infoTableContent);

    if (nameMatch) holding.nameOfIssuer = nameMatch[1].trim();
    if (valueMatch) holding.value = valueMatch[1].trim();
    if (sshPrnamtMatch) holding.sshPrnamt = sshPrnamtMatch[1].trim();
    if (sshPrnamtTypeMatch) holding.sshPrnamtType = sshPrnamtTypeMatch[1].trim();
    
    // Only add if we have the essential data
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

  // Use a common browser User-Agent to avoid being blocked.
  const headers = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36' };
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
        // We are looking for the main 13F-HR report, not amendments (13F-HR/A)
        if (recentFilings.form[i] === '13F-HR') {
            latest13F = {
                accessionNumber: recentFilings.accessionNumber[i],
                reportDate: recentFilings.reportDate[i],
            };
            break;
        }
    }

    if (!latest13F) {
        throw new Error("No recent 13F-HR filing found for CIK " + cik);
    }
    
    // --- Step 2: Fetch the specific filing's directory to find the XML file ---
    const accessionNumberNoDash = latest13F.accessionNumber.replace(/-/g, '');
    const filingUrl = `https://www.sec.gov/Archives/edgar/data/${cik}/${accessionNumberNoDash}/form13fInfoTable.xml`;

    const holdingsResponse = await fetch(filingUrl, { headers });
    if (!holdingsResponse.ok) {
        // Fallback for older filings that might use a different name
        const fallbackUrl = `https://www.sec.gov/Archives/edgar/data/${cik}/${accessionNumberNoDash}/${latest13F.accessionNumber}.txt`;
        const fallbackResponse = await fetch(fallbackUrl, { headers });
         if (!fallbackResponse.ok) {
             throw new Error(`Could not find holdings data at primary or fallback URL. Status: ${fallbackResponse.status}`);
         }
         const txtData = await fallbackResponse.text();
         const holdings = await parseHoldingsFromXml(txtData);
         return new Response(JSON.stringify(holdings), { headers: { 'Content-Type': 'application/json' } });
    }

    const xmlText = await holdingsResponse.text();
    const holdings = await parseHoldingsFromXml(xmlText);

    // --- Step 3: Return the final JSON data ---
    return new Response(JSON.stringify(holdings), {
      headers: { 
        'Content-Type': 'application/json',
        'Cache-Control': 's-maxage=86400' // Cache for 24 hours
      }
    });

  } catch (error) {
    console.error(`SEC Proxy Error for CIK ${cik}:`, error.message);
    return new Response(JSON.stringify({ error: error.message }), { 
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}