const managerUrl = "https://ai.talentspotify.com/api/reviewForm/getAllReviewsForm/6396f7d703546500086f0200/68e49939df33a7c9177aaf03/Manager?companyId=6396f7d703546500086f0200";
const employeeUrl = "https://ai.talentspotify.com/api/reviewForm/getAllReviewsForm/6396f7d703546500086f0200/68e240b0d9876d59139672d6/Employee?companyId=6396f7d703546500086f0200";
const key = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJfaWQiOiI2Mjc0ZTIzNjk2YmY5ODI0ZTQ0MWJlMTYiLCJuYW1lIjoiU3VwZXIgQWRtaW4iLCJlbWFpbCI6InN1cGVyYWRtaW5AZ21haWwuY29tIiwibW9iaWxlTnVtYmVyIjoxMjM0NTEyMzQ1LCJyb2xlIjoiU3VwZXIgQWRtaW4iLCJkZXBhcnRtZW50IjoiIiwiY29tcGFueSI6IlRhbGVudHNwb3RpZnkgUHJpdmF0ZSBMaW1pdGVkIiwicHJvZmlsZVBpY3R1cmUiOiIvc3RhdGljL21lZGlhL21hbGUuMDMxNzA2NWEyNDQzMjEyNGQ1MmEucG5nIiwibGluTWFuYWdlciI6IiIsImNvbXBhbnlJZCI6IjYzOTZmN2Q3MDM1NDY1MDAwODZmMDIwMCIsImlhdCI6MTc2OTA3NjM2NSwiZXhwIjoxNzY5MjQ5MTY1fQ.C59lyahish42UR6lh1jD2_-gojFVAUo6rm2SHC31h1Q";

async function testFetch() {
    try {
        const res = await fetch(managerUrl, { headers: { 'Authorization': `Bearer ${key}` }});
        const data = await res.json();
        console.log("Manager Data Array?", Array.isArray(data));
        console.log("Manager Data Length:", Array.isArray(data) ? data.length : "N/A");
        console.log("Manager Data preview:", JSON.stringify(data).substring(0, 100));
    } catch (e) {
        console.error("Manager Error:", e);
    }
}
testFetch();
