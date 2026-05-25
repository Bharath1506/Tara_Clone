const fs = require('fs');
const dotenv = require('dotenv');
dotenv.config({ path: './Frontend/.env' });

async function testFetch() {
    const employeeUrl = process.env.VITE_REVIEW_FORM_API_URL;
    const managerUrl = process.env.VITE_MANAGER_REVIEW_FORM_API_URL;
    const key = process.env.VITE_EMPLOYEE_API_KEY;

    console.log("Testing Manager API...");
    try {
        const res = await fetch(managerUrl, { headers: { 'Authorization': `Bearer ${key}` }});
        console.log("Manager Status:", res.status);
        const data = await res.json();
        console.log("Manager Data:", JSON.stringify(data).substring(0, 500) + "...");
    } catch (e) {
        console.error("Manager Error:", e);
    }

    console.log("\nTesting Employee API...");
    try {
        const res = await fetch(employeeUrl, { headers: { 'Authorization': `Bearer ${key}` }});
        console.log("Employee Status:", res.status);
        const data = await res.json();
        console.log("Employee Data:", JSON.stringify(data).substring(0, 500) + "...");
    } catch (e) {
        console.error("Employee Error:", e);
    }
}

testFetch();
