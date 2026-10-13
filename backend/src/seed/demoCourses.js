/** Demo training content (four BPO courses with quizzes). Generated from the original PHP seed. */
export default [
    {
        "title": "New Agent Onboarding",
        "category": "Onboarding",
        "selfEnrol": false,
        "summary": "Everything a new agent needs in the first week at Shaggar BPO: who we are, how a shift works, our service standards and the tools you will use every day.",
        "modules": [
            {
                "title": "Welcome to Shaggar BPO",
                "lessons": [
                    {
                        "title": "Who we are and what we do",
                        "type": "text",
                        "body": "# Welcome to the team\n\nShaggar BPO Enterprise delivers customer contact, sales and back-office services for clients across Ethiopia and the region.\n\nAs an agent, **you are the voice of our clients**. Every conversation shapes how a customer feels about their brand.\n\n## What you will learn this week\n- How a shift is organised and what is expected of you\n- Our service standards and quality scoring\n- The systems you will use on every call\n\n> Tip: keep this course open during your first shifts and come back to it whenever you need a reminder.",
                        "videoUrl": null,
                        "durationMin": 8
                    },
                    {
                        "title": "Your shift: schedules, breaks and adherence",
                        "type": "text",
                        "body": "# How a shift works\n\nOur clients plan staffing to the minute, so **schedule adherence** matters.\n\n1. Log in to your workstation 10 minutes before your shift.\n2. Set your status to *Available* exactly at your start time.\n3. Take breaks only at your scheduled times.\n4. Use the correct status code for every non-call activity (training, coaching, after-call work).\n\n## Adherence target\nWe aim for **95% adherence** or better. Your team lead reviews it every week.\n\n## If you are late or sick\nCall your team lead **before** your shift starts. Do not message colleagues instead.",
                        "videoUrl": null,
                        "durationMin": 10
                    }
                ]
            },
            {
                "title": "Service standards",
                "lessons": [
                    {
                        "title": "The five service standards",
                        "type": "text",
                        "body": "# Our five service standards\n\n- **Greet** — use the approved opening within 3 seconds.\n- **Listen** — let the customer finish; take notes.\n- **Resolve** — aim to fix the issue on the first contact.\n- **Confirm** — summarise what you did and the next steps.\n- **Close** — use the approved closing and offer further help.\n\nQuality analysts score a sample of your calls against these five standards every week.",
                        "videoUrl": null,
                        "durationMin": 12
                    },
                    {
                        "title": "Quality scoring explained",
                        "type": "text",
                        "body": "# How call quality is measured\n\n> Trainers: edit this lesson, change its type to Video and paste your own quality briefing video link or upload the recording.\n\n## Key points\n- Each call is scored out of 100.\n- **Critical errors** (for example, sharing data with the wrong person) mean a score of zero for that call.\n- Your monthly quality target is **85%**.",
                        "videoUrl": null,
                        "durationMin": 6
                    }
                ]
            },
            {
                "title": "Systems and tools",
                "lessons": [
                    {
                        "title": "CRM basics: finding and updating a customer record",
                        "type": "text",
                        "body": "# Working in the CRM\n\n1. Search by phone number first, then by account number.\n2. **Verify identity** before discussing any account details (see the Data Protection course).\n3. Log every contact with a clear note: reason, action taken, outcome.\n\n## Good notes are\n- Short and factual\n- Free of personal opinions\n- Written so the next agent can continue without asking the customer again",
                        "videoUrl": null,
                        "durationMin": 10
                    }
                ]
            }
        ],
        "quiz": {
            "title": "Onboarding check",
            "description": "Ten minutes, eight questions. You need 70% to pass. You can retake it.",
            "passMark": 70,
            "timeLimitMin": 10,
            "maxAttempts": 0,
            "questions": [
                {
                    "body": "How early should you log in before your shift starts?",
                    "type": "single",
                    "explanation": "Logging in 10 minutes early lets you set up your tools and be Available on time.",
                    "choices": [
                        {
                            "body": "Exactly at the start time",
                            "isCorrect": false
                        },
                        {
                            "body": "10 minutes before",
                            "isCorrect": true
                        },
                        {
                            "body": "30 minutes before",
                            "isCorrect": false
                        }
                    ]
                },
                {
                    "body": "What is our schedule adherence target?",
                    "type": "single",
                    "explanation": "We aim for 95% adherence or better.",
                    "choices": [
                        {
                            "body": "80%",
                            "isCorrect": false
                        },
                        {
                            "body": "90%",
                            "isCorrect": false
                        },
                        {
                            "body": "95%",
                            "isCorrect": true
                        },
                        {
                            "body": "100%",
                            "isCorrect": false
                        }
                    ]
                },
                {
                    "body": "If you will be late, you should message a colleague to tell the team lead.",
                    "type": "truefalse",
                    "explanation": "Always call your team lead directly, before your shift starts.",
                    "choices": [
                        {
                            "body": "True",
                            "isCorrect": false
                        },
                        {
                            "body": "False",
                            "isCorrect": true
                        }
                    ]
                },
                {
                    "body": "Which of these are part of our five service standards? (Select all that apply)",
                    "type": "multiple",
                    "explanation": "The five standards are Greet, Listen, Resolve, Confirm and Close.",
                    "choices": [
                        {
                            "body": "Greet",
                            "isCorrect": true
                        },
                        {
                            "body": "Upsell",
                            "isCorrect": false
                        },
                        {
                            "body": "Resolve",
                            "isCorrect": true
                        },
                        {
                            "body": "Confirm",
                            "isCorrect": true
                        }
                    ]
                },
                {
                    "body": "What happens to a call score when there is a critical error?",
                    "type": "single",
                    "explanation": "Critical errors such as data disclosure to the wrong person zero the call.",
                    "choices": [
                        {
                            "body": "It loses 10 points",
                            "isCorrect": false
                        },
                        {
                            "body": "It becomes zero",
                            "isCorrect": true
                        },
                        {
                            "body": "Nothing, it is only noted",
                            "isCorrect": false
                        }
                    ]
                },
                {
                    "body": "What is the monthly quality target?",
                    "type": "single",
                    "explanation": "The monthly quality target is 85%.",
                    "choices": [
                        {
                            "body": "75%",
                            "isCorrect": false
                        },
                        {
                            "body": "85%",
                            "isCorrect": true
                        },
                        {
                            "body": "95%",
                            "isCorrect": false
                        }
                    ]
                },
                {
                    "body": "What should you do before discussing account details?",
                    "type": "single",
                    "explanation": "Identity verification always comes first.",
                    "choices": [
                        {
                            "body": "Verify the caller's identity",
                            "isCorrect": true
                        },
                        {
                            "body": "Read the last note aloud",
                            "isCorrect": false
                        },
                        {
                            "body": "Transfer to a supervisor",
                            "isCorrect": false
                        }
                    ]
                },
                {
                    "body": "Good CRM notes include your personal opinion of the customer.",
                    "type": "truefalse",
                    "explanation": "Notes should be short, factual and free of opinions.",
                    "choices": [
                        {
                            "body": "True",
                            "isCorrect": false
                        },
                        {
                            "body": "False",
                            "isCorrect": true
                        }
                    ]
                }
            ]
        }
    },
    {
        "title": "Call Handling Excellence",
        "category": "Customer Service",
        "selfEnrol": true,
        "summary": "Practical techniques for confident, efficient calls: openings, active listening, handling angry customers, hold and transfer etiquette, and strong closings.",
        "modules": [
            {
                "title": "Opening and listening",
                "lessons": [
                    {
                        "title": "The perfect opening",
                        "type": "text",
                        "body": "# The first 10 seconds\n\nA strong opening sets the tone for the whole call.\n\n**Approved opening:** “Thank you for calling [client name], my name is [your name]. How may I help you today?”\n\n- Smile — it can be heard in your voice.\n- Speak slowly and clearly.\n- Use the customer's name once you have it.",
                        "videoUrl": null,
                        "durationMin": 6
                    },
                    {
                        "title": "Active listening techniques",
                        "type": "text",
                        "body": "# Active listening\n\n- **Acknowledge**: “I understand.” “I see.”\n- **Paraphrase**: repeat the issue in your own words to confirm.\n- **Ask open questions**: “Can you tell me more about…?”\n- **Avoid interrupting**, even when you already know the answer.",
                        "videoUrl": null,
                        "durationMin": 8
                    }
                ]
            },
            {
                "title": "Difficult situations",
                "lessons": [
                    {
                        "title": "Handling an angry customer: the HEAT method",
                        "type": "text",
                        "body": "# HEAT\n\n1. **Hear** them out without interrupting.\n2. **Empathise**: “I'm sorry this has happened, I understand how frustrating it is.”\n3. **Apologise** for the experience (not necessarily for fault).\n4. **Take action** and explain exactly what you will do.\n\n> Never take anger personally. The customer is upset with the situation, not with you.",
                        "videoUrl": null,
                        "durationMin": 12
                    },
                    {
                        "title": "Hold and transfer etiquette",
                        "type": "text",
                        "body": "# Hold and transfer\n\n- Always **ask permission** before placing a customer on hold.\n- Tell them how long it will take; check back every **60 seconds**.\n- For a transfer, explain why and brief the receiving agent (a **warm transfer**) so the customer does not repeat themselves.",
                        "videoUrl": null,
                        "durationMin": 7
                    }
                ]
            }
        ],
        "quiz": {
            "title": "Call handling assessment",
            "description": "Scenario-based questions on call handling. Pass mark 75%. Two attempts.",
            "passMark": 75,
            "timeLimitMin": 15,
            "maxAttempts": 2,
            "questions": [
                {
                    "body": "What does the “E” in HEAT stand for?",
                    "type": "single",
                    "explanation": "HEAT = Hear, Empathise, Apologise, Take action.",
                    "choices": [
                        {
                            "body": "Escalate",
                            "isCorrect": false
                        },
                        {
                            "body": "Empathise",
                            "isCorrect": true
                        },
                        {
                            "body": "Explain",
                            "isCorrect": false
                        }
                    ]
                },
                {
                    "body": "How often should you check back with a customer on hold?",
                    "type": "single",
                    "explanation": "Check back every 60 seconds.",
                    "choices": [
                        {
                            "body": "Every 30 seconds",
                            "isCorrect": false
                        },
                        {
                            "body": "Every 60 seconds",
                            "isCorrect": true
                        },
                        {
                            "body": "Every 3 minutes",
                            "isCorrect": false
                        }
                    ]
                },
                {
                    "body": "A warm transfer means briefing the receiving agent before connecting the customer.",
                    "type": "truefalse",
                    "explanation": "Warm transfers stop customers having to repeat themselves.",
                    "choices": [
                        {
                            "body": "True",
                            "isCorrect": true
                        },
                        {
                            "body": "False",
                            "isCorrect": false
                        }
                    ]
                },
                {
                    "body": "Which are active listening techniques? (Select all that apply)",
                    "type": "multiple",
                    "explanation": "Interrupting is the opposite of active listening.",
                    "choices": [
                        {
                            "body": "Paraphrasing",
                            "isCorrect": true
                        },
                        {
                            "body": "Interrupting to save time",
                            "isCorrect": false
                        },
                        {
                            "body": "Asking open questions",
                            "isCorrect": true
                        },
                        {
                            "body": "Acknowledging",
                            "isCorrect": true
                        }
                    ]
                },
                {
                    "body": "When should you use the customer's name?",
                    "type": "single",
                    "explanation": "Using the name builds rapport.",
                    "choices": [
                        {
                            "body": "Never",
                            "isCorrect": false
                        },
                        {
                            "body": "Once you have it",
                            "isCorrect": true
                        },
                        {
                            "body": "Only at the end",
                            "isCorrect": false
                        }
                    ]
                }
            ]
        }
    },
    {
        "title": "Data Protection & Information Security",
        "category": "Compliance",
        "selfEnrol": false,
        "summary": "Mandatory compliance training: protecting customer data, verifying identity, clean-desk rules and spotting social engineering and phishing.",
        "modules": [
            {
                "title": "Protecting customer data",
                "lessons": [
                    {
                        "title": "Why data protection matters",
                        "type": "text",
                        "body": "# Why it matters\n\nOur clients trust us with their customers' personal data. A single breach can cost a contract and harm real people.\n\n## Personal data includes\n- Names, phone numbers and addresses\n- ID and account numbers\n- Payment information\n- Call recordings",
                        "videoUrl": null,
                        "durationMin": 8
                    },
                    {
                        "title": "Identity verification (ID&V)",
                        "type": "text",
                        "body": "# Verify every caller\n\nBefore discussing **any** account information, the caller must pass ID&V:\n\n1. Full name\n2. Account or phone number\n3. **Two** security answers from the approved list\n\nIf the caller fails, you may only give general information. Never hint at the correct answers.",
                        "videoUrl": null,
                        "durationMin": 10
                    }
                ]
            },
            {
                "title": "Security at work",
                "lessons": [
                    {
                        "title": "Clean desk and device rules",
                        "type": "text",
                        "body": "# Clean desk\n\n- No phones, paper or pens at your workstation on secure floors.\n- **Lock your screen** (Windows + L) whenever you step away.\n- Never write passwords down.\n- Report a lost access card immediately.",
                        "videoUrl": null,
                        "durationMin": 6
                    },
                    {
                        "title": "Spotting phishing and social engineering",
                        "type": "text",
                        "body": "# Red flags\n\n- Urgency: “Do this now or the account will be closed.”\n- Requests for passwords or one-time codes — **we never ask for these**.\n- Callers claiming to be IT or a manager and asking you to bypass a process.\n\nIf in doubt, stop and escalate to your team lead.",
                        "videoUrl": null,
                        "durationMin": 9
                    }
                ]
            }
        ],
        "quiz": {
            "title": "Compliance certification test",
            "description": "Mandatory. Pass mark 80%. Three attempts.",
            "passMark": 80,
            "timeLimitMin": 12,
            "maxAttempts": 3,
            "questions": [
                {
                    "body": "How many security answers must a caller give to pass ID&V?",
                    "type": "single",
                    "explanation": "Name, account/phone number, plus two security answers.",
                    "choices": [
                        {
                            "body": "One",
                            "isCorrect": false
                        },
                        {
                            "body": "Two",
                            "isCorrect": true
                        },
                        {
                            "body": "Three",
                            "isCorrect": false
                        }
                    ]
                },
                {
                    "body": "Which of these is personal data? (Select all that apply)",
                    "type": "multiple",
                    "explanation": "Recordings and numbers that identify a person are personal data.",
                    "choices": [
                        {
                            "body": "Phone number",
                            "isCorrect": true
                        },
                        {
                            "body": "Call recording",
                            "isCorrect": true
                        },
                        {
                            "body": "The weather today",
                            "isCorrect": false
                        },
                        {
                            "body": "Account number",
                            "isCorrect": true
                        }
                    ]
                },
                {
                    "body": "It is fine to keep your mobile phone at your desk on a secure floor if it is switched off.",
                    "type": "truefalse",
                    "explanation": "No phones at all at workstations on secure floors.",
                    "choices": [
                        {
                            "body": "True",
                            "isCorrect": false
                        },
                        {
                            "body": "False",
                            "isCorrect": true
                        }
                    ]
                },
                {
                    "body": "A caller says they are from IT and asks for your password to fix your account. What do you do?",
                    "type": "single",
                    "explanation": "We never ask for passwords. This is social engineering.",
                    "choices": [
                        {
                            "body": "Give it, IT needs it",
                            "isCorrect": false
                        },
                        {
                            "body": "Refuse and report it to your team lead",
                            "isCorrect": true
                        },
                        {
                            "body": "Give it only if they know your name",
                            "isCorrect": false
                        }
                    ]
                },
                {
                    "body": "What is the keyboard shortcut to lock your screen on Windows?",
                    "type": "single",
                    "explanation": "Windows + L locks the screen immediately.",
                    "choices": [
                        {
                            "body": "Ctrl + L",
                            "isCorrect": false
                        },
                        {
                            "body": "Windows + L",
                            "isCorrect": true
                        },
                        {
                            "body": "Alt + F4",
                            "isCorrect": false
                        }
                    ]
                }
            ]
        }
    },
    {
        "title": "Outbound Sales Techniques",
        "category": "Sales",
        "selfEnrol": true,
        "summary": "Structured outbound calling: the call flow, discovering needs, presenting benefits, handling objections and closing ethically.",
        "modules": [
            {
                "title": "The sales call",
                "lessons": [
                    {
                        "title": "Outbound call flow",
                        "type": "text",
                        "body": "# Call flow\n\n1. **Introduce** yourself and the company; confirm you are speaking to the right person.\n2. **Permission**: “Is now a good time for two minutes?”\n3. **Discover** needs with open questions.\n4. **Present** benefits that match those needs.\n5. **Handle objections**.\n6. **Close** and confirm next steps.",
                        "videoUrl": null,
                        "durationMin": 8
                    },
                    {
                        "title": "Features vs benefits",
                        "type": "text",
                        "body": "# Sell benefits\n\nA **feature** is what a product has. A **benefit** is what it does for the customer.\n\n- Feature: “The plan includes 10 GB of data.”\n- Benefit: “You can video-call your family every week without worrying about running out.”",
                        "videoUrl": null,
                        "durationMin": 7
                    }
                ]
            },
            {
                "title": "Objections and closing",
                "lessons": [
                    {
                        "title": "Handling objections: LAER",
                        "type": "text",
                        "body": "# LAER\n\n- **Listen** fully\n- **Acknowledge** the concern\n- **Explore** with a question\n- **Respond** with a relevant benefit\n\nCommon objections: price, timing, “I need to ask my family”.",
                        "videoUrl": null,
                        "durationMin": 10
                    },
                    {
                        "title": "Ethical selling and compliance",
                        "type": "text",
                        "body": "# Sell ethically\n\n- Never pressure or mislead.\n- State prices and terms clearly.\n- Respect “no” and do-not-call requests — record them in the CRM immediately.",
                        "videoUrl": null,
                        "durationMin": 6
                    }
                ]
            }
        ],
        "quiz": {
            "title": "Sales skills quiz",
            "description": "Pass mark 70%. Unlimited attempts.",
            "passMark": 70,
            "timeLimitMin": null,
            "maxAttempts": 0,
            "questions": [
                {
                    "body": "What comes right after introducing yourself on an outbound call?",
                    "type": "single",
                    "explanation": "Always ask if now is a good time.",
                    "choices": [
                        {
                            "body": "Present the offer",
                            "isCorrect": false
                        },
                        {
                            "body": "Ask permission to continue",
                            "isCorrect": true
                        },
                        {
                            "body": "Close",
                            "isCorrect": false
                        }
                    ]
                },
                {
                    "body": "“You can video-call your family every week” is a…",
                    "type": "single",
                    "explanation": "It describes what the product does for the customer.",
                    "choices": [
                        {
                            "body": "Feature",
                            "isCorrect": false
                        },
                        {
                            "body": "Benefit",
                            "isCorrect": true
                        }
                    ]
                },
                {
                    "body": "In LAER, what does the “E” stand for?",
                    "type": "single",
                    "explanation": "Listen, Acknowledge, Explore, Respond.",
                    "choices": [
                        {
                            "body": "Explore",
                            "isCorrect": true
                        },
                        {
                            "body": "Explain",
                            "isCorrect": false
                        },
                        {
                            "body": "Escalate",
                            "isCorrect": false
                        }
                    ]
                },
                {
                    "body": "A do-not-call request can be recorded at the end of your shift.",
                    "type": "truefalse",
                    "explanation": "Record it in the CRM immediately.",
                    "choices": [
                        {
                            "body": "True",
                            "isCorrect": false
                        },
                        {
                            "body": "False",
                            "isCorrect": true
                        }
                    ]
                }
            ]
        }
    }
];
