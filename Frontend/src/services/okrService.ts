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

export const fetchReviewForm = async (): Promise<any> => {
    const apiKey = import.meta.env.VITE_EMPLOYEE_API_KEY;
    const apiUrl = import.meta.env.VITE_REVIEW_FORM_API_URL;

    if (!apiKey || !apiUrl) {
        console.warn('Review API key or URL is missing.');
        return null;
    }

    try {
        console.log('Fetching Review Form from:', apiUrl);
        // Force fetching the Manager view to ensure we see the latest Manager draft comments/ratings
        // This resolves the issue where Manager updates are hidden in the Employee view until sign-off
        const managerUrl = apiUrl.replace('/Employee', '/Manager');
        console.log('Switched to Manager View URL:', managerUrl);

        const response = await fetch(`${managerUrl}${managerUrl.includes('?') ? '&' : '?'}t=${Date.now()}`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            throw new Error(`Failed to fetch Review Form: ${response.statusText}`);
        }

        const data = await response.json();
        console.log('Fetched Review Form Data:', JSON.stringify(data, null, 2));
        return data;
    } catch (error) {
        console.error('Error fetching Review Form:', error);
        return null;
    }
};

const getCompanyId = () => {
    return (new URLSearchParams(window.location.search).get('companyId')) || '6396f7d703546500086f0200';
};

// Mutex to prevent race conditions during concurrent updates
let updateMutex: Promise<any> = Promise.resolve();
let cachedReviewForm: any = null;
let lastReviewFetchTime = 0;

export const getFreshReviewForm = async (force: boolean = false) => {
    const now = Date.now();
    if (!force && cachedReviewForm && (now - lastReviewFetchTime < 30000)) {
        return cachedReviewForm;
    }
    const fresh = await fetchReviewForm();
    if (fresh) {
        cachedReviewForm = fresh;
        lastReviewFetchTime = now;
    }
    return cachedReviewForm;
};

export const clearReviewCache = () => {
    console.log("%c[CACHE] Clearing Review Form Cache...", "color: gray;");
    cachedReviewForm = null;
    lastReviewFetchTime = 0;
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
                        updatedGoal.progressStatus = Number((totalKrAchievement / updatedGoal.children.length).toFixed(2));
                    }
                }
            }

            const objUpdate = objectiveUpdates.find((u: any) =>
                (u.id && String(u.id).trim() === String(goal._id || goal.id || "").trim()) ||
                (u.objectiveName && normalizeString(u.objectiveName) === normalizeString(goal.objective))
            );

            if (objUpdate) {
                if (objUpdate.employeeRating !== undefined) {
                    const r = Number(objUpdate.employeeRating);
                    updatedGoal.employeeRating = !isNaN(r) ? Math.round(Math.max(0, Math.min(5, r))) : 0;
                }
                if (objUpdate.managerRating !== undefined) {
                    const r = Number(objUpdate.managerRating);
                    updatedGoal.managerRating = !isNaN(r) ? Math.round(Math.max(0, Math.min(5, r))) : 0;
                }
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
                let totalKrAchievement = 0;
                updatedGoal.children.forEach((kr: any) => {
                    const actualValue = Number(kr.actual || 0);
                    const targetValue = Number(kr.target || 0);
                    const ach = targetValue > 0 ? (actualValue / targetValue) * 100 : 0;
                    totalKrAchievement += Math.min(100, ach);
                });
                if (updatedGoal.children.length > 0) {
                    updatedGoal.progressStatus = Number((totalKrAchievement / updatedGoal.children.length).toFixed(2));
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

            console.log(`[DEBUG] Trying to match competency: '${uName}'`);

            const matchComp = (cName: string) => {
                const n = normalizeString(cName || "");

                // Exact match
                if (n === uName) return true;

                // Contains match (either direction)
                if (n.includes(uName) || uName.includes(n)) return true;

                // Remove spaces and hyphens
                if (n.replace(/[\s-]/g, '') === uName.replace(/[\s-]/g, '')) return true;

                // Remove 'skills' suffix
                if (n.replace(/skills?$/i, '').trim() === uName.replace(/skills?$/i, '').trim()) return true;

                // Split by '&' and check if any part matches (for "Ownership & Accountability")
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
            const empIdx = updatedCompetencies.findIndex(c => c.type === 'employee' && matchComp(c.competencyName || c.title));
            console.log(`[DEBUG] Employee Search Result for '${uName}': Index ${empIdx}`);

            if (empIdx !== -1) {
                const r = Number(update.employeeRating);
                if (update.employeeRating !== undefined && !isNaN(r)) {
                    const empRating = Math.round(Math.max(0, Math.min(5, r)));
                    // Write to all possible field name variants for DB compatibility
                    updatedCompetencies[empIdx].Feedback = empRating;
                    updatedCompetencies[empIdx].feedback = empRating;
                    updatedCompetencies[empIdx].rating = empRating;
                    updatedCompetencies[empIdx].Rating = empRating;
                    updatedCompetencies[empIdx].score = empRating;
                }
                const empCmt = update.employeeComment || update.employeeComments || update.employeeReason || update.selfComment || update.reason || update.comment || update.Comments || update.Comment;
                if (empCmt) {
                    const cmt = String(empCmt).trim();
                    updatedCompetencies[empIdx].Comments = cmt;
                    updatedCompetencies[empIdx].comments = cmt;
                    updatedCompetencies[empIdx].Comment = cmt;
                    updatedCompetencies[empIdx].comment = cmt;
                    updatedCompetencies[empIdx].feedback_text = cmt;
                }
            }
            const mgrIdx = updatedCompetencies.findIndex(c => c.type === 'manager' && matchComp(c.competencyName || c.title));
            console.log(`[DEBUG] Manager Search Result for '${uName}': Index ${mgrIdx}`);

            if (mgrIdx !== -1) {
                const r = Number(update.managerRating);
                if (update.managerRating !== undefined && !isNaN(r)) {
                    const mgrRating = Math.round(Math.max(0, Math.min(5, r)));
                    // Write to all possible field name variants for DB compatibility
                    updatedCompetencies[mgrIdx].Feedback = mgrRating;
                    updatedCompetencies[mgrIdx].feedback = mgrRating;
                    updatedCompetencies[mgrIdx].rating = mgrRating;
                    updatedCompetencies[mgrIdx].Rating = mgrRating;
                    updatedCompetencies[mgrIdx].score = mgrRating;
                }
                const mgrCmt = update.managerComment || update.managerComments || update.managerReason || update.supervisorComment || update.reason || update.comment || update.Comments || update.Comment;
                if (mgrCmt) {
                    const cmt = String(mgrCmt).trim();
                    updatedCompetencies[mgrIdx].Comments = cmt;
                    updatedCompetencies[mgrIdx].comments = cmt;
                    updatedCompetencies[mgrIdx].Comment = cmt;
                    updatedCompetencies[mgrIdx].comment = cmt;
                    updatedCompetencies[mgrIdx].feedback_text = cmt;
                }
            }

            // Log if no match was found
            if (empIdx === -1 && mgrIdx === -1) {
                console.warn(`[DEBUG] NO MATCH FOUND for competency: '${uName}'. Available competencies:`,
                    updatedCompetencies.map(c => `${c.type}: ${c.competencyName || c.title}`));
            }
        });
        finalReviewObj.competencies = updatedCompetencies;

        // CRITICAL: Force immediate UI update for competencies
        console.log("%c[COMPETENCY] Competencies updated, forcing UI refresh...", "color: magenta; font-weight: bold;");
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
    // Optimistic Update: Update cache and trigger UI immediately
    optimisticUpdateCache(updateData);

    // Force immediate UI refresh
    setTimeout(() => {
        window.dispatchEvent(new CustomEvent('review-data-updated'));
    }, 0);

    const result = await (updateMutex = updateMutex.then(async () => {
        try {
            console.log("%c[SUBMISSION] Starting Review Sync...", "color: cyan; font-weight: bold;");

            // 1. Ensure OKR cache is warm (for initialization if needed)
            if (okrCache.length === 0) await fetchEmployeeOKRs();

            // 2. Get latest review form data
            const fullReviewData = await getFreshReviewForm();
            if (!fullReviewData || !fullReviewData.data) {
                console.error("[SUBMISSION] Failed to get fresh review form");
                return false;
            }

            // 3. Find the correct review object
            const providedId = (updateData.id || updateData._id || "").trim();
            let reviewDataArray = Array.isArray(fullReviewData.data) ? fullReviewData.data :
                (fullReviewData.data?.review ? [fullReviewData.data.review] :
                    (fullReviewData.data?.data ? (Array.isArray(fullReviewData.data.data) ? fullReviewData.data.data : [fullReviewData.data.data]) :
                        (fullReviewData.data ? [fullReviewData.data] : [])));

            reviewDataArray = reviewDataArray.sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

            let reviewObj = reviewDataArray.find((r: any) =>
                providedId && (String(r._id).toLowerCase() === providedId.toLowerCase() || String(r.id).toLowerCase() === providedId.toLowerCase())
            );

            if (!reviewObj) {
                console.warn("[SYNC] No matching review found for update. Attempting fallback...");
                const sessionEmpName = updateData.employeeFullName || '';
                reviewObj = reviewDataArray.find((r: any) => sessionEmpName && normalizeString(r.employeeFullName).includes(normalizeString(sessionEmpName)));
            }
            if (!reviewObj) {
                reviewObj = reviewDataArray.find((r: any) => r.employeeId === '68e240b0d9876d59139672d6') || reviewDataArray[0];
            }
            if (!reviewObj) {
                console.error("[SYNC] CRITICAL: Could not resolve a review object to update.");
                return false;
            }

            // 4. Apply updates locally to create the final payload
            const finalReviewObj = applyUpdateToReviewObject(reviewObj, updateData);

            // Force manager name consistency for Madhavi Peddireddy as per Report.tsx
            const isMadhavi = String(import.meta.env.VITE_MANAGER_REVIEW_FORM_API_URL || "").includes("68e49939df33a7c9177aaf03");
            if (isMadhavi) {
                finalReviewObj.managerName = "Madhavi peddireddy";
            }

            const cleanPayload = JSON.parse(JSON.stringify(finalReviewObj));

            // CRITICAL: Ensure Overall Rating is at the TOP LEVEL of the update payload
            // We use multiple variants to ensure the backend captures it
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

            console.log(`%c[SYNC] Final Overall Rating to DB: ${finalScore}`, "color: white; background: green; padding: 2px 5px; border-radius: 3px; font-weight: bold;");
            console.log(`%c[SYNC] Payload Summary: OKR Combined=${finalReviewObj.okrCombined}, Comp Combined=${finalReviewObj.compCombined}, Total Ach=${finalReviewObj.totalAchievement}%`, "color: green;");

            // 5. Cleanup metadata for API
            // CRITICAL FIX: Ensure ALL delta update fields are explicitly sent to the API
            // The backend 'updateReviewForm' endpoint processes these delta arrays
            if (updateData.objectiveReviews) cleanPayload.objectiveReviews = updateData.objectiveReviews;
            if (updateData.keyResultReviews) cleanPayload.keyResultReviews = updateData.keyResultReviews;
            if (updateData.competencyReviews) {
                // Map competency names to IDs and ensure all field variants are present in the delta
                cleanPayload.competencyReviews = updateData.competencyReviews.map((u: any) => {
                    const mappedUpdate = { ...u };
                    const uName = normalizeString(u.competencyName || u.name || "");

                    // Look for the ID of the matched competency in the final object
                    const matchedComp = finalReviewObj.competencies?.find((c: any) => {
                        const n = normalizeString(c.competencyName || c.title || "");
                        return n === uName || n.includes(uName) || uName.includes(n);
                    });

                    if (matchedComp && (matchedComp._id || matchedComp.id)) {
                        mappedUpdate.id = matchedComp._id || matchedComp.id;
                        mappedUpdate._id = matchedComp._id || matchedComp.id;
                    }

                    // Add rating variants to delta
                    const rValue = u.employeeRating ?? u.managerRating ?? u.rating ?? u.Feedback ?? u.score ?? 0;
                    if (rValue > 0) {
                        mappedUpdate.Rating = rValue;
                        mappedUpdate.rating = rValue;
                        mappedUpdate.score = rValue;
                        mappedUpdate.Feedback = rValue;
                    }

                    // Add comment variants to delta
                    const cValue = u.employeeComments ?? u.managerComments ?? u.comment ?? u.Comments ?? u.Comment;
                    if (cValue) {
                        mappedUpdate.comment = cValue;
                        mappedUpdate.Comments = cValue;
                        mappedUpdate.Comment = cValue;
                        mappedUpdate.comments = cValue;
                    }

                    return mappedUpdate;
                });
            }
            if (updateData.keyAccomplishments) cleanPayload.keyAccomplishments = updateData.keyAccomplishments;
            if (updateData.cm1) cleanPayload.cm1 = updateData.cm1;
            if (updateData.nextQuarterPlan) cleanPayload.nextQuarterPlan = updateData.nextQuarterPlan;
            if (updateData.cm2) cleanPayload.cm2 = updateData.cm2;
            if (updateData.managerOverallComments) cleanPayload.managerOverallComments = updateData.managerOverallComments;
            if (updateData.cm3) cleanPayload.cm3 = updateData.cm3;

            // Ensure calculated ratings are also at top level if not already
            cleanPayload.overallRating = finalReviewObj.overallRating;
            cleanPayload.overallScore = finalReviewObj.overallScore;
            cleanPayload.employeesRating = finalReviewObj.employeesRating;
            cleanPayload.managersRating = finalReviewObj.managersRating;
            cleanPayload.totalAchievement = finalReviewObj.totalAchievement;

            ['__v', 'createdAt', 'updatedAt'].forEach(f => delete cleanPayload[f]);
            if (cleanPayload.companyId?._id) cleanPayload.companyId = String(cleanPayload.companyId._id);
            if (cleanPayload.employeeId?._id) cleanPayload.employeeId = String(cleanPayload.employeeId._id);

            // 6. Select API Key & URL
            // Determine if this is a manager-originated update
            const isManagerAction =
                (updateData.managerRating !== undefined) ||
                (updateData.managerComments !== undefined) ||
                (updateData.manager_comments !== undefined) ||
                (updateData.managerComment !== undefined) ||
                (updateData.supervisorComment !== undefined) ||
                (updateData.objectiveReviews?.some((o: any) => o.managerRating !== undefined || o.managerFeedback !== undefined)) ||
                (updateData.keyResultReviews?.some((k: any) => k.managerRating !== undefined || k.managerFeedback !== undefined)) ||
                (updateData.competencyReviews?.some((c: any) =>
                    c.managerRating !== undefined ||
                    c.managerComments !== undefined ||
                    c.managerComment !== undefined ||
                    c.manager_comments !== undefined
                ));

            const apiKey = isManagerAction
                ? (import.meta.env.VITE_MANAGER_API_KEY || import.meta.env.VITE_EMPLOYEE_API_KEY)
                : import.meta.env.VITE_EMPLOYEE_API_KEY;

            const url = `${import.meta.env.VITE_SUBMIT_REVIEW_API_URL || 'https://ai.talentspotifyapp.com/api/reviewForm/updateReviewForm'}/${reviewObj._id}?companyId=${getCompanyId()}`;

            console.log(`[SYNC] Sending update using ${isManagerAction ? 'Manager' : 'Employee'} API Key.`);
            console.log(`[SYNC] API Key Info: ${apiKey ? (apiKey.substring(0, 8) + '...' + apiKey.substring(apiKey.length - 8)) : 'MISSING'} (Length: ${apiKey?.length || 0})`);
            console.log(`[SYNC] URL: ${url}`);
            console.log(`%c[SYNC] PAYLOAD BEING SENT:`, "color: cyan; font-weight: bold;", JSON.stringify(cleanPayload, null, 2));

            const response = await fetch(url, {
                method: 'PUT',
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(cleanPayload)
            });

            if (response.ok) {
                console.log("%c[SYNC] SUCCESS: Review synchronized with database.", "color: green; font-weight: bold;");
                cachedReviewForm = { ...fullReviewData, data: finalReviewObj };
                window.dispatchEvent(new CustomEvent('review-data-updated'));
                return true;
            } else {
                const errText = await response.text();
                console.error(`[SYNC] FAILED with status ${response.status}:`, errText);
            }
            return false;
        } catch (e) {
            console.error("[SUBMISSION] Sync Error:", e);
            return false;
        }
    }));
    return !!result;
};

// Keep existing exports for backward compatibility but route to new implementation
export const submitEmployeeSelfAssessment = (reviewData: any) => submitReviewUpdate(reviewData);
export const submitCompetencyReview = (reviewData: any) => submitReviewUpdate(reviewData);

export const updateKeyResult = async (id: string, currentValue: string): Promise<boolean> => {
    console.log(`[DEBUG] updateKeyResult called. ID: ${id}, Value: ${currentValue}`);
    // Optimistic Update for report view
    if (cachedReviewForm && cachedReviewForm.data) {
        // Sync to review form goals children immediately
        const dummyReviewData = { keyResultReviews: [{ id, actual: Number(currentValue) }] };
        optimisticUpdateCache(dummyReviewData);

        // Force immediate UI refresh
        setTimeout(() => {
            window.dispatchEvent(new CustomEvent('review-data-updated'));
        }, 0);
    }

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
            fullKeyResultObj.actual = Number(currentValue); // Changed from parseInt to Number for decimal support
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
            console.log(`[OKR UPDATE] SUCCESS for ID: ${id}. Status: ${response.status}`);
            if (objectiveIndex !== -1 && krIndex !== -1) {
                okrCache[objectiveIndex].children[krIndex] = { ...okrCache[objectiveIndex].children[krIndex], ...fullKeyResultObj };
            }
            window.dispatchEvent(new CustomEvent('review-data-updated'));
            return true;
        } else {
            const errText = await response.text();
            console.error(`[OKR UPDATE] FAILED for ID: ${id}. Status: ${response.status}. Response: ${errText}`);
        }
        return false;
    } catch (error) {
        console.error('[OKR UPDATE] Error:', error);
        return false;
    }
};
