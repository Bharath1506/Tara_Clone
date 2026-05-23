export interface KeyResult {
    id: string;
    description: string;
    target: string;
    current: string;
    metrics: string;
    _id?: string;
    keyResultName?: string;
    targetValue?: string | number;
    actual?: string | number;
    unit?: string;
}

export interface OKR {
    id: string;
    objective: string;
    keyResults: KeyResult[];
    _id?: string;
    progressStatus?: number;
    progress?: number;
    children?: any[];
}

export interface ReviewQuestion {
    id: string;
    text: string;
    category: string;
    subCategory?: string;
}

export interface Competency {
    id: string;
    name: string;
    description?: string;
    questions?: ReviewQuestion[];
}

// Utility for professionalizing spoken feedback
/**
 * Polishes spoken feedback by:
 * 1. Trimming whitespace
 * 2. Removing common spoken filler words/phrases from the start (filler-only or followed by space/comma)
 * 3. Capitalizing the first letter
 */
const polishFeedback = (text: string | null | undefined): string => {
    if (!text) return "";
    let p = String(text).trim();
    if (!p) return "";

    // Remove common verbal fillers often caught in speech-to-text
    const fillers = [
        "actually", "definitely", "basically", "clearly", "honestly", "honestly speaking",
        "to be honest", "i think", "i believe", "in my opinion", "from my side",
        "i would say", "uhm", "umm", "well", "so", "like", "actually,", "basically,"
    ];

    let changed = true;
    while (changed) {
        changed = false;
        const low = p.toLowerCase();
        for (const f of fillers) {
            // Match filler at start followed by space or comma, or if it's the only thing in the string
            if (low === f || low.startsWith(f + " ") || low.startsWith(f + ",")) {
                p = p.substring(f.length).trim().replace(/^[,\s]+/, "");
                changed = true;
                break;
            }
        }
    }

    if (!p) return "";
    // Final Polish: Capitalize first character
    return p.charAt(0).toUpperCase() + p.slice(1);
};

// Utility for string normalization
const normalizeString = (s: string) => (s || "").toLowerCase().trim().replace(/&/g, 'and').replace(/\s+/g, ' ');

// Cache to store the full KR objects so we can send complete payloads on update
let okrCache: any[] = [];

export const fetchEmployeeOKRs = async (): Promise<OKR[]> => {
    const apiKey = import.meta.env.VITE_EMPLOYEE_API_KEY;
    const apiUrl = import.meta.env.VITE_OKR_API_URL;

    if (!apiKey || !apiUrl) {
        console.warn('OKR API key or URL is missing. Returning empty OKRs.');
        return [];
    }

    try {
        const response = await fetch(apiUrl, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            throw new Error(`Failed to fetch OKRs: ${response.statusText}`);
        }

        const data = await response.json();
        console.log('Fetched OKR Data:', JSON.stringify(data, null, 2));

        // Handle different potential response structures
        let objectivesList: any[] = [];
        if (Array.isArray(data)) {
            objectivesList = data;
        } else if (data && Array.isArray(data.data)) {
            objectivesList = data.data;
        } else if (data && Array.isArray(data.objectives)) {
            objectivesList = data.objectives;
        } else {
            console.warn('Could not find an array of objectives in the response:', data);
            return [];
        }

        // Update Cache
        okrCache = objectivesList;

        // Map to internal OKR interface with fallbacks for field names
        // The API returns key results in the 'children' array
        return objectivesList.map((item: any) => ({
            id: item._id || item.id || 'unknown-id',
            objective: item.objective || item.title || item.name || item.description || 'No Objective Title',
            progressStatus: item.progressStatus || item.progress || 0,
            progress: item.progressStatus || item.progress || 0,
            weight: item.weight || 0,
            keyResults: (item.children || item.keyResults || item.key_results || []).map((kr: any) => ({
                id: kr._id || kr.krID || kr.id || 'unknown-kr-id',
                description: kr.keyResultName || kr.okrName || kr.description || kr.title || kr.name || 'No KR Description',
                target: String(kr.target || kr.targetValue || '0'),
                current: String(kr.actual || kr.current || kr.currentValue || '0'),
                metrics: kr.unit || kr.uom || kr.metrics || ''
            }))
        }));
    } catch (error) {
        console.error('Error fetching OKRs:', error);
        return [];
    }
};

const getReviewFormApiKey = (role: 'employee' | 'manager'): string | null => {
    const employeeKey = import.meta.env.VITE_EMPLOYEE_API_KEY;
    const managerKey = import.meta.env.VITE_MANAGER_API_KEY;
    if (role === 'manager') return managerKey || employeeKey || null;
    return employeeKey || managerKey || null;
};

const hasReviewData = (payload: any): boolean => {
    if (!payload || typeof payload !== 'object') return false;
    if (Array.isArray(payload.data) && payload.data.length > 0) return true;
    if (payload.data && Array.isArray(payload.data.data) && payload.data.data.length > 0) return true;
    if (payload.data && payload.data.review) return true;
    if (payload._id || payload.id) return true;
    return false;
};

// Fetch the EMPLOYEE review form (using employee URL)
export const fetchEmployeeReviewForm = async (): Promise<any> => {
    const apiKey = getReviewFormApiKey('employee');
    const apiUrl = import.meta.env.VITE_REVIEW_FORM_API_URL;
    if (!apiKey || !apiUrl) { console.warn('Employee Review API key or URL is missing.'); return null; }
    try {
        const employeeUrl = apiUrl;
        const response = await fetch(`${employeeUrl}${employeeUrl.includes('?') ? '&' : '?'}t=${Date.now()}`, {
            method: 'GET',
            headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' }
        });
        if (!response.ok) throw new Error(`Failed to fetch Employee Review Form: ${response.statusText}`);
        const data = await response.json();
        console.log('%c[FETCH] Employee Review Form fetched', 'color: green; font-weight: bold;', data);
        return data;
    } catch (error) {
        console.error('Error fetching Employee Review Form:', error);
        return null;
    }
};

// Fetch the MANAGER review form (using manager URL)
export const fetchManagerReviewForm = async (): Promise<any> => {
    const apiKey = getReviewFormApiKey('manager');
    const managerApiUrl = import.meta.env.VITE_MANAGER_REVIEW_FORM_API_URL;
    if (!apiKey || !managerApiUrl) { console.warn('Manager Review API key or URL is missing.'); return null; }
    try {
        const response = await fetch(`${managerApiUrl}${managerApiUrl.includes('?') ? '&' : '?'}t=${Date.now()}`, {
            method: 'GET',
            headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' }
        });
        if (!response.ok) throw new Error(`Failed to fetch Manager Review Form: ${response.statusText}`);
        const data = await response.json();
        console.log('%c[FETCH] Manager Review Form fetched', 'color: blue; font-weight: bold;', data);
        return data;
    } catch (error) {
        console.error('Error fetching Manager Review Form:', error);
        return null;
    }
};

// Keep the old fetchReviewForm for backward compat (fetches manager view)
export const fetchReviewForm = async (): Promise<any> => fetchManagerReviewForm();

const getCompanyId = () => {
    return (new URLSearchParams(window.location.search).get('companyId')) || '6396f7d703546500086f0200';
};

// Mutex to prevent race conditions during concurrent updates
let updateMutex: Promise<any> = Promise.resolve();

// Separate caches for employee and manager review forms
let cachedEmployeeReviewForm: any = null;
let lastEmployeeReviewFetchTime = 0;
let cachedManagerReviewForm: any = null;
let lastManagerReviewFetchTime = 0;

// Legacy alias used by other parts of the app (returns manager view for display)
let cachedReviewForm: any = null;
let lastReviewFetchTime = 0;

export const getFreshReviewForm = async (force: boolean = false) => {
    const now = Date.now();
    if (!force && cachedReviewForm && (now - lastReviewFetchTime < 3000)) return cachedReviewForm;

    let fresh = await fetchManagerReviewForm();
    let source: 'manager' | 'employee' = 'manager';

    if (!hasReviewData(fresh)) {
        console.warn('%c[FETCH] Manager review form returned no valid data, falling back to employee review form.', 'color: orange;');
        fresh = await fetchEmployeeReviewForm();
        source = 'employee';
    }

    if (!hasReviewData(fresh)) {
        console.error('%c[FETCH] Both manager and employee review form fetch failed; no review data is available.', 'color: red;');
        return null;
    }

    cachedReviewForm = fresh;
    lastReviewFetchTime = now;

    if (source === 'manager') {
        cachedManagerReviewForm = fresh;
        lastManagerReviewFetchTime = now;
    } else {
        cachedEmployeeReviewForm = fresh;
        lastEmployeeReviewFetchTime = now;
    }

    return cachedReviewForm;
};

export const getFreshEmployeeReviewForm = async (force: boolean = false) => {
    const now = Date.now();
    if (!force && cachedEmployeeReviewForm && (now - lastEmployeeReviewFetchTime < 3000)) return cachedEmployeeReviewForm;
    const fresh = await fetchEmployeeReviewForm();
    if (hasReviewData(fresh)) {
        cachedEmployeeReviewForm = fresh;
        lastEmployeeReviewFetchTime = now;
    }
    return cachedEmployeeReviewForm;
};

export const getFreshManagerReviewForm = async (force: boolean = false) => {
    const now = Date.now();
    if (!force && cachedManagerReviewForm && (now - lastManagerReviewFetchTime < 3000)) return cachedManagerReviewForm;
    const fresh = await fetchManagerReviewForm();
    if (hasReviewData(fresh)) {
        cachedManagerReviewForm = fresh;
        cachedReviewForm = fresh;
        lastManagerReviewFetchTime = now;
        lastReviewFetchTime = now;
    }
    return cachedManagerReviewForm;
};

export const clearReviewCache = () => {
    console.log("%c[CACHE] Clearing all Review Form Caches...", "color: gray;");
    cachedReviewForm = null; lastReviewFetchTime = 0;
    cachedEmployeeReviewForm = null; lastEmployeeReviewFetchTime = 0;
    cachedManagerReviewForm = null; lastManagerReviewFetchTime = 0;
};

/**
 * Internal helper to apply incremental reviewData updates to a review object.
 * This contains all the merging, initialization, and stat recalculation logic.
 */
const applyUpdateToReviewObject = (reviewObj: any, reviewData: any) => {
    const finalReviewObj = { ...reviewObj };

    // Update Overall Comments
    if (!finalReviewObj.overallComments) finalReviewObj.overallComments = { cm1: '', cm2: '', cm3: '' };
    if (!finalReviewObj.overalComments) finalReviewObj.overalComments = { cm1: '', cm2: '', cm3: '' };

    if (reviewData.cm1 || reviewData.accomplishments || reviewData.keyAccomplishments) {
        const val = String(reviewData.cm1 || reviewData.accomplishments || reviewData.keyAccomplishments).trim();
        finalReviewObj.overallComments.cm1 = val;
        finalReviewObj.overalComments.cm1 = val;
    }
    if (reviewData.cm2 || reviewData.plan || reviewData.nextQuarterPlan) {
        const val = String(reviewData.cm2 || reviewData.plan || reviewData.nextQuarterPlan).trim();
        finalReviewObj.overallComments.cm2 = val;
        finalReviewObj.overalComments.cm2 = val;
    }
    if (reviewData.cm3 || reviewData.managerOverallComments) {
        const val = String(reviewData.cm3 || reviewData.managerOverallComments).trim();
        finalReviewObj.overallComments.cm3 = val;
        finalReviewObj.overalComments.cm3 = val;
        finalReviewObj.managerOverallComments = val;
    }

    const objectiveUpdates = Array.isArray(reviewData.objectiveReviews) ? reviewData.objectiveReviews : [];
    const krUpdates = Array.isArray(reviewData.keyResultReviews) ? reviewData.keyResultReviews : [];

    // Initialize goals if missing
    if (!Array.isArray(finalReviewObj.goals) || finalReviewObj.goals.length === 0) {
        finalReviewObj.goals = okrCache.map(o => ({
            _id: o._id || o.id,
            objective: o.objective || o.title || o.name,
            weight: o.weight || 0,
            progressStatus: o.progressStatus || o.progress || 0,
            employeeRating: 0,
            managerRating: 0,
            children: (o.children || o.keyResults || []).map((kr: any) => ({
                _id: kr._id || kr.id || kr.krID,
                keyResultName: kr.keyResultName || kr.okrName || kr.description || kr.title,
                target: kr.target || 0,
                actual: kr.actual || 0,
                employeeRating: 0,
                managerRating: 0
            }))
        }));
    }

    // Initialize competencies if missing
    if (!Array.isArray(finalReviewObj.competencies) || finalReviewObj.competencies.length === 0) {
        const competencyOrder = ["Ownership & Accountability", "Professionalism", "Customer Focus", "Leadership", "Collaboration"];
        const newComps: any[] = [];
        competencyOrder.forEach(name => {
            newComps.push({ competencyName: name, title: name, type: 'employee', Feedback: 0, Comments: '' });
            newComps.push({ competencyName: name, title: name, type: 'manager', Feedback: 0, Comments: '' });
        });
        finalReviewObj.competencies = newComps;
    }

    // Merge OKR Updates
    if (Array.isArray(finalReviewObj.goals)) {
        finalReviewObj.goals = finalReviewObj.goals.map((goal: any) => {
            const cachedOkr = okrCache.find(o =>
                String(o._id || o.id || "").trim() === String(goal._id || goal.id || "").trim() ||
                (o.objective || "").trim().toLowerCase() === (goal.objective || "").trim().toLowerCase()
            );

            let updatedGoal = { ...goal };
            if (cachedOkr) {
                updatedGoal.progressStatus = cachedOkr.progressStatus !== undefined ? cachedOkr.progressStatus : (cachedOkr.progress !== undefined ? cachedOkr.progress : updatedGoal.progressStatus);
                if (Array.isArray(updatedGoal.children)) {
                    let totalKrAchievement = 0;
                    updatedGoal.children = updatedGoal.children.map((kr: any) => {
                        const cachedKr = (cachedOkr.children || cachedOkr.keyResults || []).find((ck: any) =>
                            String(ck._id || ck.id || "").trim() === String(kr._id || kr.id || kr.krID || "").trim() ||
                            (ck.keyResultName || ck.description || "").trim().toLowerCase() === (kr.keyResultName || "").trim().toLowerCase()
                        );
                        if (cachedKr) {
                            const actual = cachedKr.actual !== undefined ? cachedKr.actual : (cachedKr.current !== undefined ? cachedKr.current : kr.actual);
                            const target = cachedKr.target !== undefined ? cachedKr.target : (cachedKr.targetValue !== undefined ? cachedKr.targetValue : kr.target);

                            // Calculate achievement for this KR (0-100%)
                            const achievement = target > 0 ? (Number(actual) / Number(target)) * 100 : 0;
                            totalKrAchievement += Math.min(100, achievement);

                            return { ...kr, actual, target };
                        }
                        return kr;
                    });

                    if (updatedGoal.children.length > 0) {
                        const totalTarget = updatedGoal.children.reduce((sum: number, kr: any) => sum + Number(kr.target || 0), 0);
                        const totalActual = updatedGoal.children.reduce((sum: number, kr: any) => sum + Math.min(Number(kr.actual || 0), Number(kr.target || 0)), 0);
                        updatedGoal.progressStatus = totalTarget > 0
                            ? Number(Math.min(100, Math.max(0, (totalActual / totalTarget) * 100)).toFixed(2))
                            : updatedGoal.progressStatus;
                    }
                }
            }

            const objReview = objectiveUpdates.find((u: any) => {
                const matchObj = () => {
                    const n = normalizeString(goal.objective || "");
                    const target = normalizeString(u.objectiveName || u.name || "");
                    if (!target) return false;
                    if (n === target) return true;
                    if (n.includes(target) || target.includes(n)) return true;
                    if (n.replace(/objective:?\s*/i, '').trim() === target.replace(/objective:?\s*/i, '').trim()) return true;
                    return false;
                };
                return (u.id && String(u.id).trim() === String(goal._id || goal.id || "").trim()) || matchObj();
            });

            if (objReview) {
                if (objReview.employeeRating !== undefined || (objReview.role === 'employee' && objReview.rating !== undefined)) {
                    const r = Number(objReview.employeeRating ?? objReview.rating);
                    const val = !isNaN(r) ? Math.round(Math.max(1, Math.min(5, r))) : 0;
                    if (val > 0) {
                        updatedGoal.employeeRating = val;
                        updatedGoal.employee_rating = val;
                        updatedGoal.rating = val;
                        updatedGoal.Rating = val;
                        updatedGoal.score = val;
                    }
                }
                if (objReview.managerRating !== undefined || (objReview.role === 'manager' && objReview.rating !== undefined)) {
                    const r = Number(objReview.managerRating ?? objReview.rating);
                    const val = !isNaN(r) ? Math.round(Math.max(1, Math.min(5, r))) : 0;
                    if (val > 0) {
                        updatedGoal.managerRating = val;
                        updatedGoal.manager_rating = val;
                        updatedGoal.rating = val;
                        updatedGoal.Rating = val;
                        updatedGoal.score = val;
                        updatedGoal.Feedback = val;
                        updatedGoal.feedback = val;
                    }
                }
                const feedback = objReview.managerFeedback || objReview.employeeFeedback || objReview.feedback || objReview.comment || objReview.reason;
                if (feedback) {
                    const txt = String(feedback).trim();
                    updatedGoal.feedback = txt;
                    updatedGoal.comment = txt;
                    updatedGoal.reason = txt;
                    if (objReview.managerRating !== undefined || objReview.role === 'manager') {
                        updatedGoal.managerFeedback = txt;
                        updatedGoal.manager_feedback = txt;
                    } else {
                        updatedGoal.employeeFeedback = txt;
                        updatedGoal.employee_feedback = txt;
                    }
                }
                console.log(`[DEBUG] Matched and updated Objective: ${goal.objective}`);
            }

            if (Array.isArray(updatedGoal.children)) {
                updatedGoal.children = updatedGoal.children.map((kr: any) => {
                    const krUpdate = krUpdates.find((u: any) =>
                        (u.id && String(u.id).trim() === String(kr._id || kr.id || kr.krID || "").trim()) ||
                        (u.keyResultName && normalizeString(u.keyResultName) === normalizeString(kr.keyResultName || kr.okrName || ""))
                    );
                    if (krUpdate) {
                        let updatedKr = { ...kr };
                        if (krUpdate.actual !== undefined) updatedKr.actual = krUpdate.actual;
                        if (krUpdate.employeeRating !== undefined) updatedKr.employeeRating = Number(krUpdate.employeeRating);
                        if (krUpdate.managerRating !== undefined) updatedKr.managerRating = Number(krUpdate.managerRating);
                        // KR reasons are no longer saved
                        // if (krUpdate.employeeFeedback !== undefined) updatedKr.employeeFeedback = krUpdate.employeeFeedback;
                        // if (krUpdate.managerFeedback !== undefined) updatedKr.managerFeedback = krUpdate.managerFeedback;
                        return updatedKr;
                    }
                    return kr;
                });

                // RECALCULATE Objective Progress Status dynamically after ALL merges
                const totalKrTarget = updatedGoal.children.reduce((sum: number, kr: any) => sum + Number(kr.target || 0), 0);
                const totalKrActual = updatedGoal.children.reduce((sum: number, kr: any) => sum + Math.min(Number(kr.actual || 0), Number(kr.target || 0)), 0);
                if (updatedGoal.children.length > 0 && totalKrTarget > 0) {
                    updatedGoal.progressStatus = Number(Math.min(100, Math.max(0, (totalKrActual / totalKrTarget) * 100)).toFixed(2));
                }
            }
            return updatedGoal;
        });
    }

    // Merge Competency Updates
    const compUpdates = Array.isArray(reviewData.competencyReviews) ? reviewData.competencyReviews : [];
    if (compUpdates.length > 0) {
        console.log("[DEBUG] Processing Competency Updates:", JSON.stringify(compUpdates));
        const updatedCompetencies = [...(finalReviewObj.competencies || [])];
        compUpdates.forEach((update: any) => {
            const uName = normalizeString(update.competencyName || update.name || "");
            if (!uName) return;

            console.log(`[DEBUG] Trying to match competency: '${uName}' for role: ${update.role || 'unspecified'}`);

            const matchComp = (cName: string) => {
                const n = normalizeString(cName || "");
                if (n === uName) return true;
                if (n.includes(uName) || uName.includes(n)) return true;
                if (n.replace(/[\s-]/g, '') === uName.replace(/[\s-]/g, '')) return true;
                if (n.replace(/skills?$/i, '').trim() === uName.replace(/skills?$/i, '').trim()) return true;
                const nParts = n.split(/[&,]/).map(p => p.trim());
                const uParts = uName.split(/[&,]/).map(p => p.trim());
                for (const nPart of nParts) {
                    for (const uPart of uParts) {
                        if (nPart && uPart && (nPart.includes(uPart) || uPart.includes(nPart))) {
                            return true;
                        }
                    }
                }
                return false;
            };

            // STRICT ROLE CHECKING: Only update the record matching the specified role
            const updateRole = update.role;

            if (updateRole === 'employee' || !updateRole) {
                const empIdx = updatedCompetencies.findIndex(c => c.type === 'employee' && matchComp(c.competencyName || c.title));
                if (empIdx !== -1) {
                    const r = Number(update.employeeRating !== undefined ? update.employeeRating : update.rating);
                    if ((update.employeeRating !== undefined || update.rating !== undefined) && !isNaN(r)) {
                        const empRating = Math.round(Math.max(0, Math.min(5, r)));
                        updatedCompetencies[empIdx].Feedback = empRating;
                        updatedCompetencies[empIdx].feedback = empRating;
                        updatedCompetencies[empIdx].rating = empRating;
                        updatedCompetencies[empIdx].Rating = empRating;
                        updatedCompetencies[empIdx].score = empRating;
                    }
                    const empCmt = update.employeeComment || update.employeeComments || update.employeeReason || update.selfComment || update.reason || update.comment || update.Comments || update.Comment;
                    if (empCmt) {
                        const cmt = polishFeedback(empCmt);
                        updatedCompetencies[empIdx].Comments = cmt;
                        updatedCompetencies[empIdx].comments = cmt;
                        updatedCompetencies[empIdx].Comment = cmt;
                        updatedCompetencies[empIdx].comment = cmt;
                        updatedCompetencies[empIdx].feedback_text = cmt;
                        updatedCompetencies[empIdx].reason = cmt;
                    }
                    console.log(`[DEBUG] Updated Employee record for '${uName}'`);
                }
            }

            if (updateRole === 'manager' || !updateRole) {
                // First try strict type match, then fall back to name-only match
                // (manager review form may not have 'type' set on every competency)
                let mgrIdx = updatedCompetencies.findIndex(c => {
                    const type = (c.type || "").toLowerCase();
                    return (type === 'manager' || type === 'supervisor') && matchComp(c.competencyName || c.title);
                });
                if (mgrIdx === -1) {
                    // Fallback: match by name only — update the first matching competency not already matched by employee
                    const empMatchIdx = updatedCompetencies.findIndex(c => c.type === 'employee' && matchComp(c.competencyName || c.title));
                    mgrIdx = updatedCompetencies.findIndex((c, idx) => idx !== empMatchIdx && matchComp(c.competencyName || c.title));
                    if (mgrIdx !== -1) console.warn(`[DEBUG] Manager competency '${uName}' matched by fallback (no type field). idx=${mgrIdx}`);
                }
                if (mgrIdx !== -1) {
                    const r = Number(update.managerRating !== undefined ? update.managerRating : (update.rating !== undefined ? update.rating : 0));
                    if ((update.managerRating !== undefined || update.rating !== undefined) && !isNaN(r) && r > 0) {
                        const mgrRating = Math.round(Math.max(1, Math.min(5, r)));
                        updatedCompetencies[mgrIdx].Feedback = mgrRating;
                        updatedCompetencies[mgrIdx].feedback = mgrRating;
                        updatedCompetencies[mgrIdx].rating = mgrRating;
                        updatedCompetencies[mgrIdx].Rating = mgrRating;
                        updatedCompetencies[mgrIdx].score = mgrRating;
                        updatedCompetencies[mgrIdx].managerRating = mgrRating;
                        updatedCompetencies[mgrIdx].manager_rating = mgrRating;
                    }
                    const mgrCmt = update.managerComment || update.managerComments || update.comment || update.managerReason || update.supervisorComment || update.reason || update.Comments || update.Comment;
                    if (mgrCmt) {
                        const cmt = polishFeedback(mgrCmt);
                        updatedCompetencies[mgrIdx].Comments = cmt;
                        updatedCompetencies[mgrIdx].comments = cmt;
                        updatedCompetencies[mgrIdx].Comment = cmt;
                        updatedCompetencies[mgrIdx].comment = cmt;
                        updatedCompetencies[mgrIdx].feedback_text = cmt;
                        updatedCompetencies[mgrIdx].managerComments = cmt;
                        updatedCompetencies[mgrIdx].manager_comments = cmt;
                        updatedCompetencies[mgrIdx].managerFeedback = cmt;
                        updatedCompetencies[mgrIdx].reason = cmt;
                    }
                    console.log(`[DEBUG] Updated Manager record for '${uName}' at index ${mgrIdx}`);
                }
            }
        });
        finalReviewObj.competencies = updatedCompetencies;
        console.log("%c[OPTIMISTIC] Competencies merged and polished successfully.", "color: magenta;");
    }

    // Recalculate Stats using the SAME formula as Report.tsx:
    // Overall = (OKR_combined × 0.6) + (Comp_combined × 0.4)
    // OKR_combined  = avg(empOkrAvg, mgrOkrAvg)  — objectives only
    // Comp_combined = avg(empCompAvg, mgrCompAvg) — competencies only

    const getOkrRatings = (role: 'employee' | 'manager'): number[] => {
        const field = role === 'employee' ? 'employeeRating' : 'managerRating';
        const list: number[] = [];
        if (finalReviewObj.goals) {
            finalReviewObj.goals.forEach((g: any) => {
                const v = Math.round(Number(g[field] || 0));
                if (v > 0) list.push(v);
            });
        }
        return list;
    };

    const getCompRatings = (role: 'employee' | 'manager'): number[] => {
        const list: number[] = [];
        if (finalReviewObj.competencies) {
            finalReviewObj.competencies.forEach((c: any) => {
                if (c.type !== role) return;
                // Read from all possible field name variants
                const raw = c.Feedback ?? c.feedback ?? c.rating ?? c.score ?? 0;
                const v = Math.round(Number(raw));
                if (v > 0) list.push(v);
            });
        }
        return list;
    };

    const avg = (list: number[]) => list.length ? list.reduce((a, b) => a + b, 0) / list.length : 0;

    const empOkrRatings = getOkrRatings('employee');
    const mgrOkrRatings = getOkrRatings('manager');
    const empCompRatings = getCompRatings('employee');
    const mgrCompRatings = getCompRatings('manager');

    const empOkrAvg = avg(empOkrRatings);
    const mgrOkrAvg = avg(mgrOkrRatings);
    const empCompAvg = avg(empCompRatings);
    const mgrCompAvg = avg(mgrCompRatings);

    // Combined: if both sides rated, take their average; if only one side, use that alone
    const okrCombined = (empOkrAvg > 0 && mgrOkrAvg > 0)
        ? (empOkrAvg + mgrOkrAvg) / 2
        : (empOkrAvg + mgrOkrAvg);

    const compCombined = (empCompAvg > 0 && mgrCompAvg > 0)
        ? (empCompAvg + mgrCompAvg) / 2
        : (empCompAvg + mgrCompAvg);

    // Final weighted overall rating
    const calculatedOverall = Number(((okrCombined * 0.6) + (compCombined * 0.4)).toFixed(2));

    // Store breakdown fields for transparency
    finalReviewObj.employeesRating = Number(empOkrAvg.toFixed(2));
    finalReviewObj.managersRating = Number(mgrOkrAvg.toFixed(2));
    finalReviewObj.employeeCompAvg = Number(empCompAvg.toFixed(2));
    finalReviewObj.managerCompAvg = Number(mgrCompAvg.toFixed(2));
    finalReviewObj.okrCombined = Number(okrCombined.toFixed(2));
    finalReviewObj.compCombined = Number(compCombined.toFixed(2));

    // Save to all field variants for DB compatibility
    finalReviewObj.overallRating = calculatedOverall;
    finalReviewObj.overalRating = calculatedOverall;   // typo-compat
    finalReviewObj.overall_rating = calculatedOverall;  // snake_case compat
    finalReviewObj.overallScore = calculatedOverall;
    finalReviewObj.overall_score = calculatedOverall;

    console.log(`%c[RATING CALC] OKR: emp=${empOkrAvg.toFixed(2)}, mgr=${mgrOkrAvg.toFixed(2)}, combined=${okrCombined.toFixed(2)} | Comp: emp=${empCompAvg.toFixed(2)}, mgr=${mgrCompAvg.toFixed(2)}, combined=${compCombined.toFixed(2)} | Overall=${calculatedOverall}`, "color: cyan; font-weight: bold;");

    // Merge Qualitative Feedback (Accomplishments, Plans, Manager Comments)
    // Structure strictly to match Report.tsx expectations: overallComments.cm1, cm2, cm3
    if (!finalReviewObj.overallComments) finalReviewObj.overallComments = {};

    if (reviewData.keyAccomplishments || reviewData.cm1) {
        finalReviewObj.cm1 = reviewData.keyAccomplishments || reviewData.cm1;
        finalReviewObj.overallComments.cm1 = finalReviewObj.cm1;
    }
    if (reviewData.nextQuarterPlan || reviewData.cm2) {
        finalReviewObj.cm2 = reviewData.nextQuarterPlan || reviewData.cm2;
        finalReviewObj.overallComments.cm2 = finalReviewObj.cm2;
    }
    if (reviewData.managerOverallComments || reviewData.cm3) {
        finalReviewObj.managerOverallComments = reviewData.managerOverallComments || reviewData.cm3;
        finalReviewObj.overallComments.cm3 = finalReviewObj.managerOverallComments;
    }

    let totalAch = 0;
    if (finalReviewObj.goals) {
        finalReviewObj.goals.forEach((g: any) => {
            const weight = Number(g.weight || 0);
            const progress = Number(g.progressStatus || g.progress || 0);
            totalAch += (progress * weight) / 100;
        });
    }
    const finalAch = Math.min(100, Number(totalAch.toFixed(2)));
    finalReviewObj.totalAchievement = finalAch;
    finalReviewObj.total_achievement = finalAch;
    finalReviewObj.totalAchivement = finalAch;

    return finalReviewObj;
};

/**
 * Optimistically updates the cached review form and dispatches a UI event.
 */
const optimisticUpdateCache = (reviewData: any) => {
    if (!cachedReviewForm || !cachedReviewForm.data) return;

    const targetReviewId = (reviewData.id || reviewData._id || "").trim();
    const sessionEmpName = reviewData.employeeFullName || '';

    let reviewDataArray = Array.isArray(cachedReviewForm.data) ? cachedReviewForm.data :
        (cachedReviewForm.data?.review ? [cachedReviewForm.data.review] :
            (cachedReviewForm.data?.data ? (Array.isArray(cachedReviewForm.data.data) ? cachedReviewForm.data.data : [cachedReviewForm.data.data]) :
                (cachedReviewForm.data ? [cachedReviewForm.data] : [])));

    let reviewObj = reviewDataArray.find((r: any) => targetReviewId && (String(r._id).toLowerCase() === targetReviewId.toLowerCase() || String(r.id).toLowerCase() === targetReviewId.toLowerCase()));
    if (!reviewObj) {
        reviewObj = reviewDataArray.find((r: any) => (sessionEmpName && normalizeString(r.employeeFullName).includes(normalizeString(sessionEmpName))));
    }
    if (!reviewObj) {
        reviewObj = reviewDataArray.find((r: any) => r.employeeId === '68e240b0d9876d59139672d6') || reviewDataArray[0];
    }

    if (reviewObj) {
        const updatedObj = applyUpdateToReviewObject(reviewObj, reviewData);
        // Find index in original array to replace
        const idx = reviewDataArray.findIndex((r: any) => r._id === reviewObj._id);
        if (idx !== -1) {
            reviewDataArray[idx] = updatedObj;
            // Update the wrapper accordingly
            if (Array.isArray(cachedReviewForm.data)) cachedReviewForm.data = [...reviewDataArray];
            else if (cachedReviewForm.data?.review) cachedReviewForm.data.review = updatedObj;
            else if (cachedReviewForm.data?.data) {
                if (Array.isArray(cachedReviewForm.data.data)) cachedReviewForm.data.data = [...reviewDataArray];
                else cachedReviewForm.data.data = updatedObj;
            } else cachedReviewForm.data = updatedObj;

            console.log("%c[OPTIMISTIC] Local cache updated. Dispatching event...", "color: orange;");
            lastReviewFetchTime = Date.now();
            window.dispatchEvent(new CustomEvent('review-data-updated'));
        }
    }
};

/**
 * Unified submission function for all review updates (OKR, Competency, Accomplishments, etc.)
 */
export const submitReviewUpdate = async (updateData: any): Promise<boolean> => {
    console.log("[DEBUG] submitReviewUpdate called with:", JSON.stringify(updateData, null, 2));

    // Determine role upfront (used for deciding which review form to fetch/update)
    const isManagerAction =
        (updateData.role === 'manager') ||
        (updateData.competencyReviews?.some((u: any) => u.role === 'manager' || u.managerRating !== undefined || u.managerComments !== undefined)) ||
        (updateData.objectiveReviews?.some((u: any) => u.role === 'manager' || u.managerRating !== undefined || u.managerFeedback !== undefined)) ||
        (updateData.managerRating !== undefined) ||
        (updateData.manager_rating !== undefined) ||
        (updateData.managerComments !== undefined) ||
        (updateData.manager_comments !== undefined) ||
        (updateData.cm3 !== undefined) ||
        (updateData.managerOverallComments !== undefined);

    console.log(`%c[SYNC] Role detected: ${isManagerAction ? 'MANAGER' : 'EMPLOYEE'}`, 'color: white; background: ' + (isManagerAction ? '#9C27B0' : '#4CAF50') + '; padding: 2px 5px; border-radius: 3px;');

    // Optimistic Update: Update cache and trigger UI immediately for responsiveness
    // Force a fetch if cache is empty to ensure the very first update is also optimistic
    if (!cachedReviewForm || !cachedReviewForm.data) {
        console.log("[SYNC] Cache empty at update start. Fetching for optimistic update...");
        if (isManagerAction) getFreshManagerReviewForm(false).then(() => optimisticUpdateCache(updateData));
        else getFreshEmployeeReviewForm(false).then(() => optimisticUpdateCache(updateData));
    } else {
        optimisticUpdateCache(updateData);
    }

    console.log(`[SYNC] Executing database update for:`, Object.keys(updateData));

    // We use a mutex to ensure sequential updates and avoid race conditions on the backend.
    updateMutex = updateMutex.then(async () => {
        try {
            console.log("%c[SUBMISSION] Database Sync Started...", "color: white; background: #2196F3; padding: 2px 5px; border-radius: 3px;");

            if (okrCache.length === 0) await fetchEmployeeOKRs();

            // CRITICAL FIX: Fetch the CORRECT review form based on the role
            // Manager updates must go to the manager review form; employee updates to the employee review form
            let fullReviewData: any = null;
            if (isManagerAction) {
                fullReviewData = await getFreshManagerReviewForm(true);
                console.log('%c[SUBMISSION] Using MANAGER review form', 'color: purple; font-weight: bold;');
            } else {
                fullReviewData = await getFreshEmployeeReviewForm(true);
                console.log('%c[SUBMISSION] Using EMPLOYEE review form', 'color: green; font-weight: bold;');
            }

            if (!fullReviewData || !fullReviewData.data) {
                console.error("[SUBMISSION] Failed to get fresh review form");
                return false;
            }

            let reviewDataArray = Array.isArray(fullReviewData.data) ? fullReviewData.data :
                (fullReviewData.data?.review ? [fullReviewData.data.review] :
                    (fullReviewData.data?.data ? (Array.isArray(fullReviewData.data.data) ? fullReviewData.data.data : [fullReviewData.data.data]) :
                        (fullReviewData.data ? [fullReviewData.data] : [])));

            reviewDataArray = reviewDataArray.sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

            const providedId = (updateData.id || updateData._id || "").trim();
            let reviewObj = reviewDataArray.find((r: any) =>
                providedId && (String(r._id).toLowerCase() === providedId.toLowerCase() || String(r.id).toLowerCase() === providedId.toLowerCase())
            );

            if (!reviewObj) {
                const sessionEmpName = updateData.employeeFullName || '';
                reviewObj = reviewDataArray.find((r: any) => sessionEmpName && normalizeString(r.employeeFullName).includes(normalizeString(sessionEmpName)));
            }

            if (!reviewObj) {
                // Use known employee/manager ID as fallback
                const fallbackId = isManagerAction ? '68e49939df33a7c9177aaf03' : '68e240b0d9876d59139672d6';
                reviewObj = reviewDataArray.find((r: any) => r.employeeId === fallbackId) || reviewDataArray[0];
                console.log(`[SUBMISSION] Using fallback: employeeId=${fallbackId}, found:`, reviewObj?._id);
            }

            // CRITICAL FIX FOR MANAGER: For manager actions, ensure we are using the review object 
            // that matches the dedicated manager update URL if provided.
            if (isManagerAction) {
                const mgrUpdateUrl = import.meta.env.VITE_MANAGER_REVIEW_UPDATE_URL;
                if (mgrUpdateUrl) {
                    const match = mgrUpdateUrl.match(/\/updateReviewForm\/([a-f\d]{24}|[a-f\d]{12})/i);
                    if (match && match[1]) {
                        const forcedId = match[1];
                        const foundInArray = reviewDataArray.find((r: any) => String(r._id) === forcedId || String(r.id) === forcedId);
                        if (foundInArray) {
                            reviewObj = foundInArray;
                            console.log(`%c[MANAGER] Forced matched reviewObj from URL ID: ${forcedId}`, "color: purple; font-weight: bold;");
                        } else {
                            console.warn(`[MANAGER] Could not find review document ${forcedId} in manager's fetched list. Using best match instead.`);
                        }
                    }
                }
            }

            if (!reviewObj) {
                console.error("[SYNC] CRITICAL: Could not resolve a review object to update.");
                return false;
            }

            const finalReviewObj = applyUpdateToReviewObject(reviewObj, updateData);
            const isMadhavi = String(import.meta.env.VITE_MANAGER_REVIEW_FORM_API_URL || "").includes("68e49939df33a7c9177aaf03");
            if (isMadhavi) finalReviewObj.managerName = "Madhavi peddireddy";

            const cleanPayload = JSON.parse(JSON.stringify(finalReviewObj));
            const finalScore = finalReviewObj.overallRating;
            cleanPayload.overallRating = finalScore;
            cleanPayload.overalRating = finalScore;
            cleanPayload.overallScore = finalScore;
            cleanPayload.overall_rating = finalScore;
            cleanPayload.overall_score = finalScore;
            cleanPayload.Rating = finalScore;
            cleanPayload.final_score = finalScore;

            cleanPayload.employeesRating = finalReviewObj.employeesRating;
            cleanPayload.managersRating = finalReviewObj.managersRating;
            cleanPayload.totalAchievement = finalReviewObj.totalAchievement;
            cleanPayload.total_achievement = finalReviewObj.totalAchievement;

            // Ensure all reviews include IDs and all rating/comment variants for DB persistence
            if (updateData.objectiveReviews) {
                cleanPayload.objectiveReviews = updateData.objectiveReviews.map((u: any) => {
                    const mapped = { ...u };
                    const uName = normalizeString(u.objectiveName || u.name || "");
                    const role = u.role || (isManagerAction ? 'manager' : 'employee');
                    const isManager = (role === 'manager');

                    const matched = finalReviewObj.goals?.find((g: any) =>
                        (g._id && String(g._id).toLowerCase() === String(u.id).toLowerCase()) ||
                        normalizeString(g.objective || "") === uName
                    );
                    if (matched && (matched._id || matched.id)) mapped.id = matched._id || matched.id;

                    const r = u.managerRating ?? u.employeeRating ?? u.rating ?? 0;
                    if (r > 0) {
                        mapped.Rating = r; mapped.rating = r; mapped.score = r;
                        mapped.Feedback = r; mapped.feedback = r;
                        // Strictly set the fields the Report.tsx and backend expect
                        if (isManager) {
                            mapped.managerRating = r;
                            mapped.manager_rating = r;
                        } else {
                            mapped.employeeRating = r;
                            mapped.employee_rating = r;
                        }
                    }

                    const f = u.managerComments ?? u.employeeComments ?? u.feedback ?? u.comment ?? u.reason ?? u.managerFeedback ?? u.employeeFeedback;
                    if (f) {
                        const cmt = polishFeedback(f);
                        mapped.feedback = cmt; mapped.comment = cmt; mapped.reason = cmt;
                        mapped.Comments = cmt; mapped.comments = cmt;
                        mapped.Comment = cmt; mapped.feedback_text = cmt;

                        if (isManager) {
                            mapped.managerComments = cmt;
                            mapped.manager_comments = cmt;
                            mapped.managerFeedback = cmt;
                            mapped.managerComment = cmt;
                        } else {
                            mapped.employeeComments = cmt;
                            mapped.employee_comments = cmt;
                            mapped.employeeFeedback = cmt;
                            mapped.employeeComment = cmt;
                        }
                    }
                    return mapped;
                });
            }
            if (updateData.keyResultReviews) {
                cleanPayload.keyResultReviews = updateData.keyResultReviews.map((u: any) => {
                    const mapped = { ...u };
                    const uName = normalizeString(u.keyResultName || u.name || "");
                    let matchedKr: any = null;
                    finalReviewObj.goals?.forEach((g: any) => {
                        const found = g.children?.find((kr: any) =>
                            (kr._id && String(kr._id).toLowerCase() === String(u.id).toLowerCase()) ||
                            normalizeString(kr.keyResultName || "") === uName
                        );
                        if (found) matchedKr = found;
                    });
                    if (matchedKr && (matchedKr._id || matchedKr.id)) mapped.id = matchedKr._id || matchedKr.id;
                    const r = u.employeeRating ?? u.managerRating ?? u.rating ?? 0;
                    if (r > 0) { mapped.Rating = r; mapped.rating = r; mapped.score = r; }
                    return mapped;
                });
            }
            if (updateData.competencyReviews) {
                cleanPayload.competencyReviews = updateData.competencyReviews.map((u: any) => {
                    const mapped = { ...u };
                    const uName = normalizeString(u.competencyName || u.name || "");
                    const role = u.role || (u.managerRating !== undefined || u.managerComments !== undefined ? 'manager' : 'employee');
                    const isManager = (role === 'manager');

                    const matched = finalReviewObj.competencies?.find((c: any) => {
                        const n = normalizeString(c.competencyName || c.title || "");
                        const cType = String(c.type || '').toLowerCase();
                        const targetType = isManager ? 'manager' : 'employee';
                        return (n === uName || n.includes(uName)) &&
                            (cType === targetType || (!cType && !isManager));
                    });

                    if (matched && (matched._id || matched.id)) mapped.id = matched._id || matched.id;

                    const r = u.managerRating ?? u.employeeRating ?? u.rating ?? 0;
                    if (r > 0) {
                        mapped.Rating = r; mapped.rating = r; mapped.score = r;
                        if (isManager) mapped.managerRating = r; else mapped.employeeRating = r;
                    }

                    const c = u.managerComments ?? u.employeeComments ?? u.comment ?? u.reason ?? u.Comments ?? u.Comment;
                    if (c) {
                        const text = polishFeedback(c);
                        mapped.comment = text;
                        mapped.Comments = text;
                        mapped.Comment = text;
                        mapped.feedback_text = text;
                        mapped.reason = text;
                        if (isManager) {
                            mapped.managerComments = text;
                            mapped.managerComment = text;
                            mapped.managerFeedback = text;
                        } else {
                            mapped.employeeComments = text;
                            mapped.employeeComment = text;
                            mapped.employeeFeedback = text;
                        }
                    }

                    // Ensure role is explicitly present for backend routing
                    if (!mapped.role) mapped.role = role;

                    return mapped;
                });
            }
            // SAFETY NET for Manager OKR updates:
            // Directly inject rating/comment into cleanPayload.goals by name match.
            if (isManagerAction && updateData.objectiveReviews && Array.isArray(cleanPayload.goals)) {
                updateData.objectiveReviews.forEach((u: any) => {
                    const uName = normalizeString(u.objectiveName || u.name || "");
                    if (!uName) return;
                    const rating = Number(u.managerRating ?? u.rating ?? 0);
                    const feedback = u.managerFeedback ?? u.feedback ?? u.comment ?? u.reason ?? "";

                    let idx = cleanPayload.goals.findIndex((g: any) =>
                        normalizeString(g.objective || g.title || "").includes(uName) ||
                        uName.includes(normalizeString(g.objective || g.title || ""))
                    );
                    if (idx !== -1) {
                        if (rating > 0) {
                            cleanPayload.goals[idx].managerRating = rating;
                            cleanPayload.goals[idx].manager_rating = rating;
                            cleanPayload.goals[idx].rating = rating;
                            cleanPayload.goals[idx].Rating = rating;
                            cleanPayload.goals[idx].score = rating;
                            cleanPayload.goals[idx].Feedback = rating;
                            cleanPayload.goals[idx].feedback = rating;
                            console.log(`%c[SAFETY-OKR] ${uName} rating=${rating} injected.`, 'color: cyan;');
                        }
                        if (feedback) {
                            const txt = polishFeedback(feedback);
                            cleanPayload.goals[idx].managerFeedback = txt;
                            cleanPayload.goals[idx].manager_feedback = txt;
                            cleanPayload.goals[idx].feedback = txt;
                            cleanPayload.goals[idx].comment = txt;
                            cleanPayload.goals[idx].reason = txt;
                            console.log(`%c[SAFETY-OKR] ${uName} feedback polished and injected.`, 'color: cyan;');
                        }
                    }
                });
            }

            // SAFETY NET for competency updates (Manager & Employee):
            // Directly inject polished rating/comment into cleanPayload.competencies by name match.
            if (updateData.competencyReviews && Array.isArray(cleanPayload.competencies)) {
                updateData.competencyReviews.forEach((u: any) => {
                    const uName = normalizeString(u.competencyName || u.name || "");
                    if (!uName) return;

                    const role = u.role || (isManagerAction ? 'manager' : 'employee');
                    const isManager = (role === 'manager');

                    const rating = Number(isManager ? (u.managerRating ?? u.rating) : (u.employeeRating ?? u.rating ?? 0));
                    const commentText = u.managerComments ?? u.employeeComments ?? u.comment ?? u.reason ?? u.Comments ?? u.Comment ?? "";

                    let idx = cleanPayload.competencies.findIndex((c2: any) => {
                        const ctype = String(c2.type || "").toLowerCase();
                        const target = isManager ? 'manager' : 'employee';
                        return (ctype === target || (ctype === 'supervisor' && isManager)) && normalizeString(c2.competencyName || c2.title || "").includes(uName);
                    });

                    if (idx === -1) {
                        idx = cleanPayload.competencies.findIndex((c2: any) =>
                            normalizeString(c2.competencyName || c2.title || "").includes(uName) &&
                            String(c2.role || c2.type || "").toLowerCase() === (isManager ? 'manager' : 'employee')
                        );
                    }

                    if (idx !== -1) {
                        if (rating > 0) {
                            cleanPayload.competencies[idx].Feedback = rating;
                            cleanPayload.competencies[idx].feedback = rating;
                            cleanPayload.competencies[idx].rating = rating;
                            cleanPayload.competencies[idx].Rating = rating;
                            if (isManager) {
                                cleanPayload.competencies[idx].managerRating = rating;
                                cleanPayload.competencies[idx].manager_rating = rating;
                                cleanPayload.competencies[idx].type = 'manager';
                            } else {
                                cleanPayload.competencies[idx].employeeRating = rating;
                                cleanPayload.competencies[idx].employee_rating = rating;
                                cleanPayload.competencies[idx].type = 'employee';
                            }
                        }
                        if (commentText) {
                            const text = polishFeedback(commentText);
                            cleanPayload.competencies[idx].Comments = text;
                            cleanPayload.competencies[idx].comments = text;
                            cleanPayload.competencies[idx].Comment = text;
                            cleanPayload.competencies[idx].comment = text;
                            cleanPayload.competencies[idx].reason = text;
                            cleanPayload.competencies[idx].feedback_text = text;

                            if (isManager) {
                                cleanPayload.competencies[idx].managerComments = text;
                                cleanPayload.competencies[idx].manager_comments = text;
                                cleanPayload.competencies[idx].managerFeedback = text;
                            } else {
                                cleanPayload.competencies[idx].employeeComments = text;
                                cleanPayload.competencies[idx].employee_comments = text;
                                cleanPayload.competencies[idx].employeeFeedback = text;
                            }
                            console.log(`%c[SAFETY-COMP] ${uName} (${role}) feedback polished and injected.`, 'color: magenta;');
                        }
                    }
                });
            }

            if (updateData.keyAccomplishments || updateData.cm1) {
                const val = polishFeedback(updateData.keyAccomplishments || updateData.cm1);
                cleanPayload.keyAccomplishments = val; cleanPayload.cm1 = val;
                if (!cleanPayload.overallComments) cleanPayload.overallComments = {};
                cleanPayload.overallComments.cm1 = val;
            }
            if (updateData.nextQuarterPlan || updateData.cm2) {
                const val = polishFeedback(updateData.nextQuarterPlan || updateData.cm2);
                cleanPayload.nextQuarterPlan = val; cleanPayload.cm2 = val;
                if (!cleanPayload.overallComments) cleanPayload.overallComments = {};
                cleanPayload.overallComments.cm2 = val;
            }
            if (updateData.managerOverallComments || updateData.cm3) {
                const val = polishFeedback(updateData.managerOverallComments || updateData.cm3);
                cleanPayload.managerOverallComments = val; cleanPayload.cm3 = val;
                if (!cleanPayload.overallComments) cleanPayload.overallComments = {};
                cleanPayload.overallComments.cm3 = val;
            }
            ['__v', 'createdAt', 'updatedAt'].forEach(f => delete cleanPayload[f]);
            if (cleanPayload.companyId?._id) cleanPayload.companyId = String(cleanPayload.companyId._id);
            if (cleanPayload.employeeId?._id) cleanPayload.employeeId = String(cleanPayload.employeeId._id);

            const apiKey = import.meta.env.VITE_EMPLOYEE_API_KEY;
            const submitBaseUrl = import.meta.env.VITE_SUBMIT_REVIEW_API_URL || 'https://ai.talentspotifyapp.com/api/reviewForm/updateReviewForm';

            // Unified URL construction: Use the base submission API for both roles, 
            // targeting the specific review form document ID.
            let url = `${submitBaseUrl}/${reviewObj._id}`;
            url += `${url.includes('?') ? '&' : '?'}companyId=${getCompanyId()}`;

            console.log(`%c[SUBMISSION] PUT to URL: ${url} (Role: ${isManagerAction ? 'MANAGER' : 'EMPLOYEE'})`, 'color: blue; font-weight: bold;');

            const response = await fetch(url, {
                method: 'PUT',
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(cleanPayload)
            });

            if (response.ok) {
                console.log("%c[SYNC] API SUCCESS - Record updated in DB.", "color: white; background: #4CAF50; padding: 2px 5px; border-radius: 3px; font-weight: bold;");

                // CRITICAL: Invalidate ALL related caches to ensure the Report UI (which uses getFreshReviewForm) is updated
                cachedReviewForm = null;
                lastReviewFetchTime = 0;

                if (isManagerAction) {
                    lastManagerReviewFetchTime = 0;
                    cachedManagerReviewForm = null;
                } else {
                    lastEmployeeReviewFetchTime = 0;
                    cachedEmployeeReviewForm = null;
                }

                // Re-fetch the updated form immediately to populate cache
                if (isManagerAction) await getFreshManagerReviewForm(true);
                else await getFreshEmployeeReviewForm(true);

                window.dispatchEvent(new CustomEvent('review-data-updated'));
                return true;
            } else {
                const errText = await response.text();
                console.error(`[SYNC] API ERROR:`, response.status, errText);
                return false;
            }
        } catch (e) {
            console.error("[SUBMISSION] Sync Error:", e);
            return false;
        }
    });

    return await updateMutex;
};

export const submitEmployeeSelfAssessment = (reviewData: any) => submitReviewUpdate(reviewData);
export const submitCompetencyReview = (reviewData: any) => submitReviewUpdate(reviewData);

export const updateKeyResult = async (id: string, currentValue: string): Promise<boolean> => {
    console.log(`[DEBUG] updateKeyResult called. ID: ${id}, Value: ${currentValue}`);

    // Optimistic Update
    const optimisticUpdatePayload = { keyResultReviews: [{ id, actual: Number(currentValue) }] };
    optimisticUpdateCache(optimisticUpdatePayload);

    const apiKey = import.meta.env.VITE_EMPLOYEE_API_KEY;
    const updateUrlBase = import.meta.env.VITE_UPDATE_KEY_RESULT_API_URL || 'https://ai.talentspotifyapp.com/api/keyresults/updatekeyResult';
    const companyId = getCompanyId();

    try {
        let fullKeyResultObj: any = null;
        let objectiveIndex = -1;
        let krIndex = -1;

        for (let i = 0; i < okrCache.length; i++) {
            const objective = okrCache[i];
            const children = objective.children || objective.keyResults || [];
            const foundIndex = children.findIndex((kr: any) => String(kr.id || kr._id || kr.krID || "").trim() === String(id || "").trim());
            if (foundIndex !== -1) {
                fullKeyResultObj = { ...children[foundIndex] };
                objectiveIndex = i;
                krIndex = foundIndex;
                break;
            }
        }

        if (fullKeyResultObj) {
            fullKeyResultObj.actual = Number(currentValue);
            fullKeyResultObj.updatedAt = new Date().toISOString();
        } else {
            fullKeyResultObj = { actual: Number(currentValue) };
        }

        const url = `${updateUrlBase}/${id}?companyId=${companyId}`;
        const response = await fetch(url, {
            method: 'PUT',
            headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(fullKeyResultObj)
        });

        if (response.ok) {
            console.log(`[OKR UPDATE] Database SUCCESS for ID: ${id}.`);
            if (objectiveIndex !== -1 && krIndex !== -1) {
                if (!okrCache[objectiveIndex].children) okrCache[objectiveIndex].children = [];
                okrCache[objectiveIndex].children[krIndex].actual = Number(currentValue);
            }
            lastReviewFetchTime = 0; // Invalidate review form cache too
            window.dispatchEvent(new CustomEvent('review-data-updated'));
            return true;
        } else {
            console.error(`[OKR UPDATE] Database FAILED status: ${response.status}`);
            return false;
        }
    } catch (error) {
        console.error('[OKR UPDATE] Error:', error);
        return false;
    }
};
