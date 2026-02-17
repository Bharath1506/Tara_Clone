import { useState, useEffect, useCallback, useRef } from 'react';
import { useToast } from '@/hooks/use-toast';

import { getVapiInstance, getVapiMetadata, getSystemPromptWithConfigs } from '@/services/vapiService';
import { fetchEmployeeOKRs, updateKeyResult, getFreshReviewForm, submitCompetencyReview, submitEmployeeSelfAssessment, clearReviewCache } from '@/services/okrService';

export interface VapiMessage {
    role: 'user' | 'assistant' | 'system';
    content: string;
    timestamp: Date;
    speaker?: string; // Name of the speaker (Employee, Manager, or Tara)
}

export const useVapi = () => {
    const [isCallActive, setIsCallActive] = useState(false);
    const [isSpeaking, setIsSpeaking] = useState(false);
    const [messages, setMessages] = useState<VapiMessage[]>([]);
    const [transcript, setTranscript] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [currentSpeaker, setCurrentSpeaker] = useState<string>('Participant');
    const [beingAddressed, setBeingAddressed] = useState<string | null>(null);
    const [isMuted, setIsMuted] = useState(false);
    const [isToolExecuting, setIsToolExecuting] = useState(false);
    const [participantNames, setParticipantNames] = useState<{ employee: string, manager: string }>({ employee: 'Employee', manager: 'Manager' });
    const participantNamesRef = useRef<{ employee: string, manager: string }>({ employee: 'Employee', manager: 'Manager' });
    const [callStartTime, setCallStartTime] = useState<Date | null>(null);
    const speakerMapRef = useRef<Record<string, string>>({});
    const assignedRolesRef = useRef<string[]>([]);
    const lastTaraMessageRef = useRef<string>('');
    const silenceTimerRef = useRef<NodeJS.Timeout | null>(null);
    const silenceStageRef = useRef<number>(0);
    const { toast } = useToast();

    const vapi = getVapiInstance();

    useEffect(() => {
        const onCallStart = () => {
            console.log('Vapi call started');
            setIsCallActive(true);
            setCallStartTime(new Date());
            setError(null);
            speakerMapRef.current = {};
            assignedRolesRef.current = [];
        };

        const onCallEnd = () => {
            console.log('Vapi call ended');
            setIsCallActive(false);
            setIsSpeaking(false);
            setIsMuted(false);
            setMessages([]);
            setParticipantNames({ employee: 'Employee', manager: 'Manager' });
            setCurrentSpeaker('Participant');
            setBeingAddressed(null);
            setTranscript('');
            if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
            silenceStageRef.current = 0;
            clearReviewCache();
        };

        const onSpeechStart = () => {
            console.log('Vapi speech started');
            setIsSpeaking(true);
        };

        const onSpeechEnd = () => {
            console.log('Vapi speech ended');
            setIsSpeaking(false);
        };

        const onMessage = async (message: any) => {
            if (message.type === 'transcript' && message.transcriptType === 'final') {
                if (silenceTimerRef.current) {
                    clearTimeout(silenceTimerRef.current);
                    silenceStageRef.current = 0;
                }

                let speakerLabel = currentSpeaker;

                if (message.role === 'user') {
                    const speakerId = message.speakerId ?? message.speaker_id;

                    if (speakerId !== undefined && speakerId !== null) {
                        const sId = String(speakerId);
                        if (!speakerMapRef.current[sId]) {
                            const empName = participantNamesRef.current.employee;
                            const mgrName = participantNamesRef.current.manager;

                            if (!assignedRolesRef.current.includes(empName)) {
                                speakerMapRef.current[sId] = empName;
                                assignedRolesRef.current.push(empName);
                            } else if (!assignedRolesRef.current.includes(mgrName)) {
                                speakerMapRef.current[sId] = mgrName;
                                assignedRolesRef.current.push(mgrName);
                            } else {
                                speakerMapRef.current[sId] = `Participant ${sId}`;
                            }
                        }
                        speakerLabel = speakerMapRef.current[sId];
                        setCurrentSpeaker(speakerLabel);
                    }
                } else if (message.role === 'assistant') {
                    speakerLabel = 'Tara (HR Assistant)';
                    const taraText = message.transcript.toLowerCase().trim();
                    const empName = participantNamesRef.current.employee.toLowerCase();
                    const mgrName = participantNamesRef.current.manager.toLowerCase();

                    const startsWithEmp = taraText.startsWith(empName);
                    const startsWithMgr = taraText.startsWith(mgrName);

                    if (startsWithEmp && !startsWithMgr) {
                        setBeingAddressed('Employee');
                    } else if (startsWithMgr && !startsWithEmp) {
                        setBeingAddressed('Manager');
                    } else {
                        const firstClause = taraText.split(/[.!?]|,/).map((p: any) => p.trim()).filter(Boolean)[0] || taraText;
                        const empInFirst = firstClause.includes(empName);
                        const mgrInFirst = firstClause.includes(mgrName);

                        if (empInFirst && !mgrInFirst) {
                            setBeingAddressed('Employee');
                        } else if (mgrInFirst && !empInFirst) {
                            setBeingAddressed('Manager');
                        } else if (empInFirst && mgrInFirst) {
                            setBeingAddressed(firstClause.indexOf(empName) < firstClause.indexOf(mgrName) ? 'Employee' : 'Manager');
                        }
                    }
                    lastTaraMessageRef.current = taraText;
                }

                const newMessage: VapiMessage = {
                    role: message.role === 'assistant' ? 'assistant' : 'user',
                    content: message.transcript,
                    timestamp: new Date(),
                    speaker: speakerLabel
                };

                setMessages(prev => {
                    if (prev.length > 0) {
                        const lastMsg = prev[prev.length - 1];
                        if (lastMsg.role === newMessage.role) {
                            const trimmedLast = lastMsg.content.trim();
                            const trimmedNew = newMessage.content.trim();
                            if (trimmedLast === trimmedNew) return prev;
                            if (trimmedLast.endsWith(trimmedNew)) return prev;

                            const updated = [...prev];
                            updated[updated.length - 1] = {
                                ...lastMsg,
                                content: lastMsg.content + ' ' + newMessage.content,
                                timestamp: newMessage.timestamp,
                                speaker: speakerLabel
                            };
                            return updated;
                        }
                    }
                    return [...prev, newMessage];
                });
            }

            if (message.type === 'transcript' && message.transcriptType === 'partial') {
                setTranscript(message.transcript);
                if (silenceTimerRef.current) {
                    clearTimeout(silenceTimerRef.current);
                    silenceStageRef.current = 0;
                }
            }

            if (message.type === 'tool-calls') {
                console.log('Tool call received:', message);
                setIsToolExecuting(true);

                for (const toolCall of message.toolCallList) {
                    const toolName = toolCall.function.name;
                    const args = typeof toolCall.function.arguments === 'string'
                        ? JSON.parse(toolCall.function.arguments)
                        : toolCall.function.arguments;

                    console.log(`%c[VAPI] TOOL CALL: ${toolName}`, "color: white; background: blue; padding: 2px 5px; border-radius: 3px;", args);

                    let result = "";
                    let success = false;

                    try {
                        if (toolName === 'update_key_result' || toolName === 'update_okr_rating') {
                            console.log(`[VAPI] Processing Update ${toolName}`, args);

                            if (toolName === 'update_key_result') {
                                const { id, value } = args;
                                success = await updateKeyResult(id, value);
                                if (success) {
                                    toast({
                                        title: "OKR Updated",
                                        description: `Key Result actual value updated to ${value}`,
                                        variant: "default",
                                        className: "bg-green-100 border-green-500 text-green-900"
                                    });
                                }
                                result = success ? "OK" : "FAILED: Could not update Key Result.";
                            } else {
                                let { id, reviewId, rating, role, type, name, comment } = args;

                                // Clean common AI hallucinations from IDs (like "[ID_123]" or "ID: 123")
                                const cleanId = (s: any) => String(s || "").replace(/[\[\]]/g, "").replace(/^id:\s*/i, "").trim();
                                id = cleanId(id);
                                reviewId = cleanId(reviewId);

                                const updateData: any = {};
                                const ratingKey = `${role}Rating`;

                                let targetReviewId = reviewId;
                                if (!targetReviewId || targetReviewId === 'unknown' || targetReviewId === '') {
                                    console.log(`%c[VAPI TOOL] reviewId missing or unknown. Fetching latest form...`, "color: orange;");
                                    const currentForm = await getFreshReviewForm();
                                    let reviews = currentForm?.data?.review ? [currentForm.data.review] :
                                        (currentForm?.data?.data ? (Array.isArray(currentForm.data.data) ? currentForm.data.data : [currentForm.data.data]) :
                                            (Array.isArray(currentForm?.data) ? currentForm.data : []));

                                    if (reviews && reviews.length > 0) {
                                        // Sort by updatedAt/createdAt to find the LATEST review
                                        reviews = reviews.sort((a: any, b: any) => {
                                            const dateA = new Date(a.updatedAt || a.createdAt || 0).getTime();
                                            const dateB = new Date(b.updatedAt || b.createdAt || 0).getTime();
                                            return dateB - dateA;
                                        });
                                        targetReviewId = reviews[0]._id || reviews[0].id;
                                        console.log(`[VAPI TOOL] Resolved latest Review ID: ${targetReviewId}`);
                                    } else {
                                        console.warn(`[VAPI TOOL] No active reviews found to update.`);
                                    }
                                }
                                updateData.id = targetReviewId;

                                const typeLower = String(type || "").toLowerCase();
                                if (typeLower === 'objective') {
                                    const objReview: any = { id, objectiveName: name };
                                    if (rating !== undefined) objReview[ratingKey] = rating;
                                    // OKR reasons are no longer sent
                                    // if (comment !== undefined) objReview[`${role}Feedback`] = comment;
                                    updateData.objectiveReviews = [objReview];
                                    console.log(`[VAPI TOOL] Preparing objective review update (Rating Only):`, objReview);
                                } else if (typeLower === 'key_result' || typeLower === 'kr') {
                                    const krReview: any = { id, keyResultName: name };
                                    if (rating !== undefined) krReview[ratingKey] = rating;
                                    // KR reasons are no longer sent
                                    // if (comment !== undefined) krReview[`${role}Feedback`] = comment;
                                    updateData.keyResultReviews = [krReview];
                                    console.log(`[VAPI TOOL] Preparing key result review update (Rating Only):`, krReview);
                                } else if (typeLower === 'competency') {
                                    const competencyData: any = { competencyName: name };
                                    if (rating !== undefined) competencyData[`${role}Rating`] = rating;
                                    if (comment !== undefined) competencyData[`${role}Comments`] = comment;
                                    updateData.competencyReviews = [competencyData];
                                    console.log(`[VAPI TOOL] Preparing competency review update:`, competencyData);
                                } else if (typeLower.includes('accomplishment')) {
                                    updateData.keyAccomplishments = comment;
                                    updateData.cm1 = comment;
                                    console.log(`[VAPI TOOL] Preparing accomplishments update:`, comment);
                                } else if (typeLower.includes('plan')) {
                                    updateData.nextQuarterPlan = comment;
                                    updateData.cm2 = comment;
                                    console.log(`[VAPI TOOL] Preparing next quarter plan update:`, comment);
                                } else if (typeLower.includes('manager') && typeLower.includes('comment')) {
                                    updateData.managerOverallComments = comment;
                                    updateData.cm3 = comment;
                                    console.log(`[VAPI TOOL] Preparing manager comments update:`, comment);
                                }

                                updateData.employeeFullName = participantNamesRef.current.employee;
                                updateData.managerName = participantNamesRef.current.manager;

                                const isManagerComment = type === 'manager_comments' || type === 'manager_comment';
                                // Log update attempt
                                console.log(`[VAPI TOOL] Updating Rating: ${type} for ${role}. Name: ${name}, Rating: ${rating}`);

                                // All rating updates now use the unified submitReviewUpdate service
                                // which automatically selects the correct API key/URL based on the role and data
                                console.log(`[VAPI TOOL] Executing Service Sync:`, updateData);
                                success = await (submitEmployeeSelfAssessment as any)(updateData);

                                if (success) {
                                    toast({
                                        title: "Review Updated",
                                        description: `${role === 'employee' ? 'Employee' : 'Manager'} ${type} has been saved.`,
                                        variant: "default",
                                        className: "bg-purple-100 border-purple-500 text-purple-900"
                                    });
                                }

                                const detail = rating !== undefined ? "rating" : (comment ? "reason/comment" : "update");
                                const identifier = name || id || "this item";
                                result = success
                                    ? "OK"
                                    : `FAILED: Could not record ${role} ${type} ${detail} for '${identifier}'.`;
                            }

                            vapi.send({
                                type: 'tool-output',
                                toolCallId: toolCall.id,
                                output: result
                            } as any);
                        } else if (toolName === 'submit_employee_self_assessment') {
                            success = await submitEmployeeSelfAssessment(args);
                            result = success ? "Success" : "Failed";
                            vapi.send({ type: 'tool-output', toolCallId: toolCall.id, output: result } as any);
                        } else if (toolName === 'submit_competency_review') {
                            success = await submitCompetencyReview(args);
                            result = success ? "Success" : "Failed";
                            vapi.send({ type: 'tool-output', toolCallId: toolCall.id, output: result } as any);
                        } else if (toolName === 'end_session') {
                            result = "Ending session.";
                            vapi.send({ type: 'tool-output', toolCallId: toolCall.id, output: result } as any);
                            setTimeout(() => vapi.stop(), 20000);
                        } else {
                            result = `Unknown tool: ${toolName}`;
                            vapi.send({ type: 'tool-output', toolCallId: toolCall.id, output: result } as any);
                        }
                    } catch (e) {
                        const errorMessage = e instanceof Error ? e.message : String(e);
                        console.error(`%c[VAPI] Error executing ${toolName}:`, "color: red;", e);
                        result = `Error: ${errorMessage}`;
                        vapi.send({ type: 'tool-output', toolCallId: toolCall.id, output: result } as any);
                        toast({ title: "Tool Error", description: errorMessage, variant: "destructive" });
                    }
                }
                setIsToolExecuting(false);
            }
        };

        const onError = (error: any) => {
            console.error('Detailed Vapi Error:', error);
            let errorMessage = error?.error?.message || error?.message || (typeof error === 'object' ? JSON.stringify(error) : String(error));
            if (errorMessage === '{}' || !errorMessage) {
                errorMessage = "Connection error. Please check whitelisting.";
            }
            setError(errorMessage);
        };

        vapi.on('call-start', onCallStart);
        vapi.on('call-end', onCallEnd);
        vapi.on('speech-start', onSpeechStart);
        vapi.on('speech-end', onSpeechEnd);
        vapi.on('message', onMessage);
        vapi.on('error', onError);

        return () => {
            vapi.off('call-start', onCallStart);
            vapi.off('call-end', onCallEnd);
            vapi.off('speech-start', onSpeechStart);
            vapi.off('speech-end', onSpeechEnd);
            vapi.off('message', onMessage);
            vapi.off('error', onError);
        };
    }, [vapi]);

    // Silence detection logic
    useEffect(() => {
        if (!isCallActive) {
            if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
            silenceStageRef.current = 0;
            return;
        }

        if (isSpeaking || isToolExecuting) {
            if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
            silenceStageRef.current = 0;
            return;
        }

        const monitorSilence = () => {
            if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);

            silenceTimerRef.current = setTimeout(() => {
                if (!isCallActive || isSpeaking || isToolExecuting) return;

                silenceStageRef.current += 1;
                console.log(`Silence detected. Stage: ${silenceStageRef.current}`);

                if (silenceStageRef.current === 1) {
                    toast({
                        title: "Silence Detected",
                        description: "Tara is waiting for your response. Please continue the conversation.",
                        variant: "default",
                        className: "bg-amber-50 border-amber-500 text-amber-900"
                    });

                    setMessages(prev => [...prev, {
                        role: 'system',
                        content: "(System: Long pause detected. Tara is prompting for a response.)",
                        timestamp: new Date()
                    }]);

                    vapi.send({
                        type: 'add-message',
                        message: {
                            role: 'system',
                            content: "There has been a naturally long pause. Maintaining your calm and polite tone, please gently check if they are ready or need more time. LEAD WITH THEIR NAME."
                        }
                    } as any);
                } else if (silenceStageRef.current === 2) {
                    toast({
                        title: "Still Silent",
                        description: "Are you still there? Tara will end the session if there's no activity.",
                        variant: "destructive",
                    });

                    setMessages(prev => [...prev, {
                        role: 'system',
                        content: "(System: Extended silence. Tara will soon conclude the session.)",
                        timestamp: new Date()
                    }]);

                    vapi.send({
                        type: 'add-message',
                        message: {
                            role: 'system',
                            content: "The participants are still silent. In a calm and polite manner, offer to move to the next section or provide assistance. LEAD WITH NAME."
                        }
                    } as any);
                } else if (silenceStageRef.current >= 3) {
                    toast({
                        title: "Session Ending",
                        description: "Due to extended silence, the session is being concluded.",
                        variant: "destructive",
                    });

                    setMessages(prev => [...prev, {
                        role: 'system',
                        content: "(System: Session ending due to inactivity.)",
                        timestamp: new Date()
                    }]);

                    vapi.send({
                        type: 'add-message',
                        message: {
                            role: 'system',
                            content: "Extended silence. Please inform the participants that the session will remain active until they choose to end it."
                        }
                    } as any);
                    return;
                }
                monitorSilence();
            }, silenceStageRef.current === 0 ? 20000 : 25000);
        };

        monitorSilence();

        return () => {
            if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
        };
    }, [isCallActive, isSpeaking, isToolExecuting, vapi, toast, setMessages]);

    const startCall = useCallback(async (managerInputName?: string, employeeInputName?: string) => {
        try {
            const okrs = await fetchEmployeeOKRs();
            const reviewData = await getFreshReviewForm(true);

            setParticipantNames({ employee: employeeInputName || 'Employee', manager: managerInputName || 'Manager' });
            participantNamesRef.current = { employee: employeeInputName || 'Employee', manager: managerInputName || 'Manager' };

            const systemPrompt = getSystemPromptWithConfigs(okrs, reviewData, employeeInputName, managerInputName);
            const assistantId = import.meta.env.VITE_VAPI_ASSISTANT_ID || '43d3bb67-ade8-403d-87ba-0d00c5ff991f';

            await vapi.start(assistantId, {
                model: {
                    provider: 'groq',
                    model: 'llama3-70b-8192',
                    messages: [
                        {
                            role: 'system',
                            content: systemPrompt
                        }
                    ],
                    tools: [
                        {
                            type: "function",
                            function: {
                                name: "update_key_result",
                                description: "Update the current actual value of a Key Result.",
                                parameters: {
                                    type: "object",
                                    properties: {
                                        id: { type: "string", description: "The internal ID of the Key Result." },
                                        value: { type: "string", description: "The new actual value (number)." }
                                    },
                                    required: ["id", "value"]
                                }
                            }
                        },
                        {
                            type: "function",
                            function: {
                                name: "update_okr_rating",
                                description: "Record a rating or comment for an Objective, Key Result, or Competency.",
                                parameters: {
                                    type: "object",
                                    properties: {
                                        id: { type: "string", description: "The ID of the item being rated." },
                                        reviewId: { type: "string", description: "The ID of the review session." },
                                        role: { type: "string", enum: ["employee", "manager"], description: "Who is providing the rating." },
                                        type: { type: "string", description: "Type of item: 'objective', 'key_result', 'competency', 'accomplishments', 'manager_comments', etc." },
                                        name: { type: "string", description: "Name of the item." },
                                        rating: { type: "number", description: "Rating value (1-5)." },
                                        comment: { type: "string", description: "Qualitative feedback or reason." }
                                    },
                                    required: ["role", "type"]
                                }
                            }
                        },
                        {
                            type: "function",
                            function: {
                                name: "submit_employee_self_assessment",
                                description: "Submit the employee's self-assessment part of the review.",
                                parameters: { type: "object", properties: {} }
                            }
                        },
                        {
                            type: "function",
                            function: {
                                name: "submit_competency_review",
                                description: "Submit the competency review section.",
                                parameters: { type: "object", properties: {} }
                            }
                        },
                        {
                            type: "function",
                            function: {
                                name: "end_session",
                                description: "End the performance review session.",
                                parameters: { type: "object", properties: {} }
                            }
                        }
                    ]
                },
                firstMessage: `Hi. I'm Tara, your HR-AI assistant. Thank you, ${employeeInputName || 'Employee'} and ${managerInputName || 'Manager'}. Thank you for joining the performance review session. Can we start?`
            } as any);

        } catch (err: any) {
            console.error('Failed to start call:', err);
            setError(err.message || 'Failed to start call');
        }
    }, [vapi, toast, setMessages]);

    const stopCall = useCallback(async () => {
        try {
            await vapi.stop();
        } catch (err: any) {
            setError(err.message || 'Failed to stop call');
        }
    }, [vapi]);

    const sendMessage = useCallback((message: string) => {
        try {
            vapi.send({
                type: 'add-message',
                message: { role: 'user', content: message }
            } as any);

            const newMessage: VapiMessage = {
                role: 'user',
                content: message,
                timestamp: new Date(),
                speaker: currentSpeaker
            };
            setMessages(prev => [...prev, newMessage]);
        } catch (err: any) {
            setError(err.message || 'Failed to send message');
        }
    }, [vapi, currentSpeaker, setMessages]);

    const setSpeaker = useCallback((speakerName: string) => {
        setCurrentSpeaker(speakerName);
    }, []);

    const toggleMute = useCallback(() => {
        const newMuteState = !isMuted;
        try {
            vapi.setMuted(newMuteState);
            setIsMuted(newMuteState);
            return true;
        } catch (err) {
            console.error('Failed to toggle mute:', err);
            return false;
        }
    }, [vapi, isMuted]);

    return {
        isCallActive,
        isSpeaking,
        isMuted,
        messages,
        transcript,
        error,
        currentSpeaker,
        beingAddressed,
        participantNames,
        callStartTime,
        startCall,
        stopCall,
        sendMessage,
        setSpeaker,
        toggleMute
    };
};
