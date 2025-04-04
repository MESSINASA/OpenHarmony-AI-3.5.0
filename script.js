// API Keys
const TONGYI_API_KEY = 'sk-6754170ab1f04480a4203b0533af77b9';
const DEEPSEEK_API_KEY = 'sk-65901308df384148bcfa6882d6062197';

// DOM Elements
const chatMessages = document.getElementById('chatMessages');
const userInput = document.getElementById('userInput');
const sendButton = document.getElementById('sendButton');
const imageUpload = document.getElementById('imageUpload');
// const currentMode = document.getElementById('currentMode');

// 智能API选择规则
const API_RULES = {
    IMAGE_RELATED: /图片|看图|识别|照片|图像|显示/i,
    CODE_RELATED: /代码|编程|程序|开发|bug|调试|javascript|python|java|css|html/i,
    MATH_RELATED: /计算|数学|方程|求解|证明/i
};

// 添加本地回答库
const LOCAL_RESPONSES = {
    // 基础问候
    '你好': '你好！我是启鸿，很高兴为您服务。',
    '你是谁': '我是启鸿，一个智能AI助手。我可以帮您解答问题、分析图片、编程等。',
    '你叫什么': '我叫启鸿，是您的AI助手。',
    '你的名字': '我的名字是启鸿。',
    
    // 常见问题
    '你会做什么': '我可以：\n1. 回答问题和对话\n2. 分析图片\n3. 编程和数学计算\n4. 创意写作和内容创作',
    '你能做什么': '我可以：\n1. 回答问题和对话\n2. 分析图片\n3. 编程和数学计算\n4. 创意写作和内容创作',
    
    // 情感回应
    '谢谢': '不用谢！很高兴能帮到您。',
    '谢谢你': '不用谢！作为启鸿，我很开心能帮助到您。',
    '再见': '再见！如果还有问题随时找我。',
    
    // 简单问题
    '现在几点': () => `现在是 ${new Date().toLocaleTimeString()}`,
    '今天星期几': () => `今天是星期${['日','一','二','三','四','五','六'][new Date().getDay()]}`,
    '今天日期': () => `今天是 ${new Date().toLocaleDateString()}`,
};

// Handle image uploads
let selectedImages = [];
imageUpload.addEventListener('change', (e) => {
    const files = Array.from(e.target.files);
    selectedImages = [];
    
    files.forEach(file => {
        const reader = new FileReader();
        reader.onload = (e) => {
            selectedImages.push(e.target.result);
            // Add image preview to chat
            const preview = document.createElement('img');
            preview.src = e.target.result;
            preview.className = 'image-preview';
            chatMessages.appendChild(preview);
        };
        reader.readAsDataURL(file);
    });
});

// 智能选择API
function selectAPI(message, hasImages) {
    if (hasImages) return 'tongyi'; // 有图片时只能用通义千问

    // 根据消息内容智能判断
    if (API_RULES.IMAGE_RELATED.test(message)) return 'tongyi';
    if (API_RULES.CODE_RELATED.test(message)) return 'deepseek';
    if (API_RULES.MATH_RELATED.test(message)) return 'deepseek';
    
    // 默认使用通义千问
    return 'tongyi';
}

// 添加模糊匹配功能
function findBestMatch(input) {
    input = input.toLowerCase().trim();
    
    // 精确匹配
    if (LOCAL_RESPONSES[input]) {
        return typeof LOCAL_RESPONSES[input] === 'function' 
            ? LOCAL_RESPONSES[input]() 
            : LOCAL_RESPONSES[input];
    }
    
    // 模糊匹配
    for (let key of Object.keys(LOCAL_RESPONSES)) {
        if (input.includes(key) || key.includes(input)) {
            return typeof LOCAL_RESPONSES[key] === 'function' 
                ? LOCAL_RESPONSES[key]() 
                : LOCAL_RESPONSES[key];
        }
    }
    
    return null;
}

// 添加上下文管理
const ContextManager = {
    // 存储对话历史
    history: [],
    
    // 最大上下文长度
    maxContextLength: 10,
    
    // 添加新的对话
    add(role, content, type = 'text') {
        this.history.push({
            role,
            content,
            type,
            timestamp: Date.now()
        });
        
        // 保持上下文长度在限制内
        if (this.history.length > this.maxContextLength) {
            this.history.shift();
        }
    },
    
    // 获取格式化的上下文用于API调用
    getFormattedContext(api = 'tongyi') {
        if (api === 'tongyi') {
            return this.history.map(item => ({
                role: item.role,
                content: item.type === 'text' 
                    ? [{ type: "text", text: item.content }]
                    : item.content
            }));
        } else {
            return this.history.map(item => ({
                role: item.role,
                content: item.content
            }));
        }
    },
    
    // 获取最近的对话主题
    getRecentTopic() {
        const recentMessages = this.history.slice(-3);
        return recentMessages.map(msg => msg.content).join(' ');
    },
    
    // 清除上下文
    clear() {
        this.history = [];
    }
};

// 添加推理模式状态
let reasoningMode = false;

// 在现有的 DOM Elements 部分添加
const toggleReasoningButton = document.createElement('button');
toggleReasoningButton.id = 'toggleReasoning';
toggleReasoningButton.className = 'toggle-reasoning';
toggleReasoningButton.innerHTML = `
    <span class="thinking-icon">🤔</span>
    <span class="status-text">推理模式：关闭</span>
`;

// 将按钮添加到界面
const inputContainer = document.querySelector('.input-container');
inputContainer.insertBefore(toggleReasoningButton, inputContainer.firstChild);

// 添加切换推理模式的事件监听器
toggleReasoningButton.addEventListener('click', () => {
    reasoningMode = !reasoningMode;
    toggleReasoningButton.innerHTML = `
        <span class="thinking-icon">🤔</span>
        <span class="status-text">推理模式：${reasoningMode ? '开启' : '关闭'}</span>
    `;
    toggleReasoningButton.classList.toggle('active', reasoningMode);
});

// 修改发送消息函数
async function sendMessage() {
    const message = userInput.value.trim();
    if (!message && selectedImages.length === 0) return;

    // 添加用户消息到聊天和上下文
    addMessageToChat(message, true);
    ContextManager.add('user', message);
    userInput.value = '';

    // 尝试本地回答
    const localResponse = findBestMatch(message);
    if (localResponse && !selectedImages.length) {
        const thinkingDiv = document.createElement('div');
        thinkingDiv.className = 'thinking';
        thinkingDiv.textContent = '启鸿思考中';
        chatMessages.appendChild(thinkingDiv);

        await new Promise(resolve => setTimeout(resolve, 300));
        thinkingDiv.remove();
        
        // 添加本地回答到上下文
        ContextManager.add('assistant', localResponse);
        addMessageToChat(localResponse, false);
        return;
    }

    const thinkingDiv = document.createElement('div');
    thinkingDiv.className = 'thinking';
    thinkingDiv.textContent = '启鸿思考中';
    chatMessages.appendChild(thinkingDiv);

    try {
        const selectedApi = selectAPI(message, selectedImages.length > 0);
        if (selectedApi === 'tongyi') {
            await sendToTongyi(message, selectedImages);
        } else {
            await sendToDeepseek(message);
        }
    } catch (error) {
        console.error('Error:', error);
        addMessageToChat('抱歉，处理您的请求时出现错误。', false);
    } finally {
        const thinkingElement = document.querySelector('.thinking');
        if (thinkingElement) thinkingElement.remove();
    }

    selectedImages = [];
    imageUpload.value = '';
}

// Add message to chat
function addMessageToChat(message, isUser, apiName = '') {
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${isUser ? 'user' : 'ai'}`;
    
    // 添加骨架屏
    messageDiv.classList.add('message-skeleton');
    
    const contentDiv = document.createElement('div');
    contentDiv.className = 'message-content';
    
    // 模拟加载延迟
    setTimeout(() => {
        messageDiv.classList.remove('message-skeleton');
        
        if (!isUser && containsCode(message)) {
            contentDiv.innerHTML = formatMessage(message);
        } else {
            contentDiv.textContent = message;
        }
        
        // 添加 HarmonyOS NEXT 动画效果
        messageDiv.style.transform = 'translateY(20px)';
        messageDiv.style.opacity = '0';
        
        requestAnimationFrame(() => {
            messageDiv.style.transform = 'translateY(0)';
            messageDiv.style.opacity = '1';
        });
    }, 300);
    
    messageDiv.appendChild(contentDiv);
    chatMessages.appendChild(messageDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

// 检查消息是否包含代码块
function containsCode(message) {
    return message.includes('```') || message.match(/`[^`]+`/g);
}

// 格式化消息，处理代码块
function formatMessage(message) {
    // 处理多行代码块
    message = message.replace(/```(\w*)\n([\s\S]*?)```/g, (match, language, code) => {
        const formattedCode = formatCode(code, language);
        return `<pre class="code-block ${language}"><code>${formattedCode}</code></pre>`;
    });
    
    // 处理行内代码
    message = message.replace(/`([^`]+)`/g, '<code class="inline-code">$1</code>');
    
    // 处理普通文本的换行
    message = message.replace(/\n/g, '<br>');
    
    return message;
}

// 格式化代码，添加缩进和语法高亮
function formatCode(code, language) {
    // 移除开头和结尾的空行
    code = code.trim();
    
    // 处理缩进
    let lines = code.split('\n');
    let minIndent = Infinity;
    
    // 找出最小缩进
    lines.forEach(line => {
        if (line.trim()) {
            const indent = line.match(/^\s*/)[0].length;
            minIndent = Math.min(minIndent, indent);
        }
    });
    
    // 规范化缩进
    lines = lines.map(line => {
        if (line.trim()) {
            return line.slice(minIndent);
        }
        return '';
    });
    
    // 转义HTML字符
    code = lines.join('\n')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
    
    return code;
}

// 修改 sendToTongyi 函数
async function sendToTongyi(message, images) {
    // 优化上下文管理
    const contextMessages = ContextManager.getFormattedContext('tongyi').slice(-3); // 只保留最近3条对话
    
    // 优化系统消息
    const systemMessage = {
        role: "system",
        content: [{ 
            type: "text", 
            text: "你是启鸿，一个有帮助的中文AI助手。保持简洁和重点。"
        }]
    };

    // 优化消息构建
    const messages = [systemMessage, ...contextMessages];

    // 优化图片处理
    if (images && images.length > 0) {
        const imageContent = images.map(image => ({
            type: "image_url",
            image_url: { url: image }
        }));
        
        messages.push({
            role: "user",
            content: [...imageContent, { type: "text", text: message }]
        });
    } else {
        messages.push({
            role: "user",
            content: [{ type: "text", text: message }]
        });
    }

    try {
        const response = await fetch('https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${TONGYI_API_KEY}`
            },
            body: JSON.stringify({
                model: 'qvq-max',
                messages: messages,
                stream: true,
                temperature: 0.5, // 降低温度参数，使输出更确定性
                top_p: 0.7, // 调整采样参数
                max_tokens: 800, // 限制输出长度
                presence_penalty: -0.5, // 添加惩罚参数，减少重复
                frequency_penalty: -0.5 // 添加频率惩罚，使输出更简洁
            })
        });

        // 创建响应处理器
        const responseHandler = new ResponseHandler(chatMessages);
        await responseHandler.processStream(response);

    } catch (error) {
        console.error('API调用错误:', error);
        throw error;
    }
}

// 添加响应处理器类
class ResponseHandler {
    constructor(chatContainer) {
        this.chatContainer = chatContainer;
        this.reasoningDiv = null;
        this.messageDiv = null;
        this.reasoningContent = '';
        this.aiResponse = '';
        this.isAnswering = false;
        this.decoder = new TextDecoder();
        this.buffer = '';
        this.updateBuffer = ''; // 添加更新缓冲区
        this.updateTimeout = null; // 添加更新定时器
        this.lastUpdateTime = 0; // 添加最后更新时间记录
        
        this.initializeElements();
    }

    initializeElements() {
        if (reasoningMode) {
            // 创建思维过程显示区域
            this.reasoningDiv = document.createElement('div');
            this.reasoningDiv.className = 'message ai reasoning';
            const reasoningContentDiv = document.createElement('div');
            reasoningContentDiv.className = 'reasoning-content';
            this.reasoningDiv.appendChild(reasoningContentDiv);
            this.chatContainer.appendChild(this.reasoningDiv);
        }

        // 创建回答显示区域
        this.messageDiv = document.createElement('div');
        this.messageDiv.className = 'message ai';
        const contentDiv = document.createElement('div');
        contentDiv.className = 'message-content';
        this.messageDiv.appendChild(contentDiv);
        this.chatContainer.appendChild(this.messageDiv);
    }

    async processStream(response) {
        const reader = response.body.getReader();
        const contentDiv = this.messageDiv?.querySelector('.message-content');
        const reasoningContentDiv = reasoningMode ? 
            this.reasoningDiv?.querySelector('.reasoning-content') : null;

        if (!contentDiv) {
            console.error('Message content div not found');
            return;
        }

        const UPDATE_INTERVAL = 50; // 设置更新间隔为50ms

        const updateContent = () => {
            if (this.updateBuffer.length > 0) {
                if (reasoningMode && reasoningContentDiv) {
                    reasoningContentDiv.innerHTML = formatMessage(this.reasoningContent + this.updateBuffer);
                }
                this.reasoningContent += this.updateBuffer;
                this.updateBuffer = '';
            }
            
            if (this.shouldScroll()) {
                requestAnimationFrame(() => {
                    this.chatContainer.scrollTop = this.chatContainer.scrollHeight;
                });
            }
        };

        try {
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                this.buffer += this.decoder.decode(value, { stream: true });
                const lines = this.buffer.split('\n');
                this.buffer = lines.pop() || '';

                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        const content = line.slice(6).trim();
                        if (content === '[DONE]') continue;

                        try {
                            const data = JSON.parse(content);
                            const delta = data.choices[0].delta;

                            if (delta.reasoning_content && reasoningMode) {
                                this.updateBuffer += delta.reasoning_content;
                                
                                // 使用节流进行更新
                                const now = Date.now();
                                if (now - this.lastUpdateTime >= UPDATE_INTERVAL) {
                                    updateContent();
                                    this.lastUpdateTime = now;
                                }
                            } else if (delta.content) {
                                if (!this.isAnswering && reasoningMode && this.reasoningDiv) {
                                    this.isAnswering = true;
                                    this.reasoningDiv.style.opacity = '0.7';
                                }
                                this.aiResponse += delta.content;
                                
                                // 使用 requestAnimationFrame 优化渲染
                                requestAnimationFrame(() => {
                                    if (containsCode(this.aiResponse)) {
                                        contentDiv.innerHTML = formatMessage(this.aiResponse);
                                    } else {
                                        contentDiv.textContent = this.aiResponse;
                                    }
                                });
                            }

                        } catch (parseError) {
                            console.warn('Parse warning:', parseError);
                            continue;
                        }
                    }
                }
            }
        } finally {
            // 确保最后的内容被更新
            updateContent();
            this.finalizeResponse();
        }

        return this.aiResponse;
    }

    shouldScroll() {
        const threshold = 100;
        const distanceToBottom = this.chatContainer.scrollHeight - 
                               (this.chatContainer.scrollTop + this.chatContainer.clientHeight);
        return distanceToBottom <= threshold;
    }

    finalizeResponse() {
        // 添加到上下文
        if (this.aiResponse) {
            ContextManager.add('assistant', this.aiResponse);
        }
    }
}

// 修改 sendToDeepseek 函数
async function sendToDeepseek(message) {
    const contextMessages = ContextManager.getFormattedContext('deepseek');
    
    try {
        const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${DEEPSEEK_API_KEY}`
            },
            body: JSON.stringify({
                model: 'deepseek-chat',
                messages: [
                    { 
                        role: "system", 
                        content: `你是启鸿，一个有帮助的中文AI助手。请记住以下要点：
                        1. 你的名字永远是启鸿
                        2. 请根据上下文连贯地回答问题
                        3. 理解用户的意图和情感
                        4. 保持对话的连续性
                        当前对话主题: ${ContextManager.getRecentTopic()}`
                    },
                    ...contextMessages,
                    { role: "user", content: message }
                ]
            })
        });

        const data = await response.json();
        const aiResponse = data.choices[0].message.content;
        
        // 添加到上下文
        ContextManager.add('assistant', aiResponse);
        addMessageToChat(aiResponse, false);
    } catch (error) {
        throw error;
    }
}

// Event listeners
sendButton.addEventListener('click', sendMessage);
userInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
    }
});

// 添加本地回答库管理功能
const LocalResponseManager = {
    // 添加新的回答
    add(question, answer) {
        LOCAL_RESPONSES[question.toLowerCase().trim()] = answer;
    },
    
    // 删除回答
    remove(question) {
        delete LOCAL_RESPONSES[question.toLowerCase().trim()];
    },
    
    // 更新回答
    update(question, answer) {
        this.add(question, answer);
    },
    
    // 获取所有回答
    getAll() {
        return {...LOCAL_RESPONSES};
    }
};

// 添加动态学习功能
function learnFromConversation(question, answer) {
    // 如果是简单的问答（少于50个字符），添加到本地库
    if (question.length < 50 && answer.length < 100) {
        LocalResponseManager.add(question, answer);
    }
}

// 在现有代码末尾添加介绍动画相关代码
document.addEventListener('DOMContentLoaded', () => {
    const introOverlay = document.getElementById('introOverlay');
    const featureItems = document.querySelectorAll('.feature-item');
    
    // 确保特性列表项正确显示
    featureItems.forEach((item, index) => {
        item.style.animationDelay = `${0.5 + (index * 0.5)}s`;
    });
});

// 优化本地回答显示动画
function addLocalResponseAnimation(messageDiv) {
    messageDiv.style.animation = 'none';
    messageDiv.style.opacity = '0';
    messageDiv.style.transform = 'translateY(20px)';
    
    // 触发重排
    void messageDiv.offsetWidth;
    
    messageDiv.style.animation = 'messageIn 0.5s var(--harmony-transition) forwards';
}

// 添加清除上下文的功能
function clearContext() {
    ContextManager.clear();
    addMessageToChat('对话上下文已清除，让我们开始新的对话吧！', false);
}

// 添加上下文相关的命令到本地回答库
LOCAL_RESPONSES['清除上下文'] = () => {
    clearContext();
    return '好的，我已经清除了之前的对话记录，让我们重新开始吧！';
};

LOCAL_RESPONSES['重新开始'] = () => {
    clearContext();
    return '好的，让我们重新开始对话吧！';
};

// 添加CSS样式
const style = document.createElement('style');
style.textContent = `
    .reasoning {
        background-color: var(--secondary-bg);
        opacity: 1;
        transition: opacity 0.3s ease;
        margin-bottom: 8px;
    }
    
    .reasoning-content {
        color: #666;
        font-style: italic;
        padding: 8px;
    }
    
    .message.ai {
        transition: all 0.3s ease;
    }
    
    .message-content {
        white-space: pre-wrap;
    }
`;
document.head.appendChild(style); 

// 添加版本更新介绍函数
function showUpdateIntro() {
    const updateOverlay = document.createElement('div');
    updateOverlay.className = 'update-overlay';
    updateOverlay.innerHTML = `
        <div class="update-content">
            <div class="update-header">
                <div class="version-tag">V2.0</div>
                <h2 class="update-title">视觉推理升级</h2>
                <div class="update-subtitle">全新升级，更强大的视觉分析能力</div>
            </div>
            <div class="update-features">
                <div class="update-feature">
                    <div class="feature-icon">🔍</div>
                    <div class="feature-details">
                        <h3>思维链输出</h3>
                        <p>清晰展示AI的推理过程，让分析更透明</p>
                    </div>
                </div>
                <div class="update-feature">
                    <div class="feature-icon">🎯</div>
                    <div class="feature-details">
                        <h3>多模态理解</h3>
                        <p>支持图片、视频的深度分析</p>
                    </div>
                </div>
                <div class="update-feature">
                    <div class="feature-icon">🎬</div>
                    <div class="feature-details">
                        <h3>视频分析</h3>
                        <p>支持视频内容的智能解析</p>
                    </div>
                </div>
                <div class="update-feature">
                    <div class="feature-icon">💡</div>
                    <div class="feature-details">
                        <h3>增强多轮对话</h3>
                        <p>更自然的对话体验，更强的上下文理解</p>
                    </div>
                </div>
            </div>
        </div>
    `;

    document.body.appendChild(updateOverlay);

    // 4.5秒后淡出更新介绍
    setTimeout(() => {
        updateOverlay.classList.add('fade-out');
        setTimeout(() => {
            updateOverlay.remove();
            // 显示欢迎消息
            addMessageToChat('欢迎使用启鸿AI助手升级版！我现在支持更强大的视觉推理能力，让我们开始对话吧！', false);
        }, 800);
    }, 4500);
}

// 添加 HarmonyOS NEXT 动画管理器
const HarmonyAnimation = {
    // 弹性动画配置
    spring: {
        tension: 170,
        friction: 26
    },
    
    // 智能场景化交互
    setupInteractions() {
        this.setupDragInteraction();
        this.setupScrollEffects();
        this.setupInputEffects();
    },
    
    // 拖拽交互
    setupDragInteraction() {
        const messages = document.querySelectorAll('.message');
        messages.forEach(message => {
            let isDragging = false;
            let startY = 0;
            let scrollStartY = 0;
            
            message.addEventListener('mousedown', (e) => {
                isDragging = true;
                startY = e.clientY;
                scrollStartY = chatMessages.scrollTop;
                message.classList.add('dragging');
            });
            
            document.addEventListener('mousemove', (e) => {
                if (!isDragging) return;
                
                const delta = e.clientY - startY;
                chatMessages.scrollTop = scrollStartY - delta;
            });
            
            document.addEventListener('mouseup', () => {
                if (!isDragging) return;
                isDragging = false;
                message.classList.remove('dragging');
            });
        });
    },
    
    // 滚动效果
    setupScrollEffects() {
        const chatMessages = document.querySelector('.chat-messages');
        let lastScrollTop = 0;
        
        chatMessages.addEventListener('scroll', () => {
            requestAnimationFrame(() => {
                const scrollTop = chatMessages.scrollTop;
                const scrollDirection = scrollTop > lastScrollTop ? 'down' : 'up';
                
                document.querySelectorAll('.message').forEach(message => {
                    const rect = message.getBoundingClientRect();
                    const viewportHeight = window.innerHeight;
                    
                    if (rect.top < viewportHeight && rect.bottom > 0) {
                        const progress = 1 - (rect.top / viewportHeight);
                        const transform = `translateZ(${progress * 20}px)`;
                        message.style.transform = transform;
                    }
                });
                
                lastScrollTop = scrollTop;
            });
        });
    },
    
    // 输入效果
    setupInputEffects() {
        const userInput = document.querySelector('#userInput');
        
        userInput.addEventListener('focus', () => {
            document.querySelector('.input-container').style.transform = 'translateY(-8px)';
        });
        
        userInput.addEventListener('blur', () => {
            document.querySelector('.input-container').style.transform = 'translateY(0)';
        });
    },
    
    // 错误提示
    showError(element) {
        element.classList.add('error-shake');
        setTimeout(() => {
            element.classList.remove('error-shake');
        }, 400);
    }
};

// 初始化动画
document.addEventListener('DOMContentLoaded', () => {
    HarmonyAnimation.setupInteractions();
});