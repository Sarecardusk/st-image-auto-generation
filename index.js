// The main script for the extension
// The following are examples of some basic extension functionality

//You'll likely need to import extension_settings, getContext, and loadExtensionSettings from extensions.js
import { extension_settings, getContext } from "../../../extensions.js";
//You'll likely need to import some other functions from the main script
import { saveSettingsDebounced, eventSource, event_types, updateMessageBlock } from "../../../../script.js";
import { appendMediaToMessage } from "../../../../script.js";
import { regexFromString } from '../../../utils.js';
import { SlashCommandParser } from "../../../slash-commands/SlashCommandParser.js";

// 扩展名称和路径
const extensionName = "st-image-auto-generation";
// /scripts/extensions/third-party
const extensionFolderPath = `/scripts/extensions/third-party/${extensionName}`;

// 插入类型常量
const INSERT_TYPE = {
    DISABLED: 'disabled',
    INLINE: 'inline',
    NEW_MESSAGE: 'new',
    REPLACE: 'replace'
};

// 默认设置
const defaultSettings = {
    insertType: INSERT_TYPE.DISABLED,
    aiPromptGeneration: false,
    apiUrl: '',
    apiKey: '',
    model: '',
    maxChatHistory: 1,
    enableWorldInfo: false,
    orderedPrompts: '',
};

// 从设置更新UI
function updateUI() {
    // 根据insertType设置开关状态
    $("#auto_generation").toggleClass('selected', extension_settings[extensionName].insertType !== INSERT_TYPE.DISABLED);

    // 只在表单元素存在时更新它们
    if ($("#image_generation_insert_type").length) {
        $('#image_generation_insert_type').val(extension_settings[extensionName].insertType);
        $('#ai_prompt_generation').prop('checked', extension_settings[extensionName].aiPromptGeneration);
        $('#api_url').val(extension_settings[extensionName].apiUrl);
        $('#api_key').val(extension_settings[extensionName].apiKey);
        $('#model').val(extension_settings[extensionName].model);
        $('#max_chat_history').val(extension_settings[extensionName].maxChatHistory);
        $('#enable_world_info').prop('checked', extension_settings[extensionName].enableWorldInfo);
        $('#ordered_prompts').val(extension_settings[extensionName].orderedPrompts);

        if (extension_settings[extensionName].aiPromptGeneration) {
            $('#ai_prompt_settings').show();
        } else {
            $('#ai_prompt_settings').hide();
        }
    }
}

// 加载设置
async function loadSettings() {
    extension_settings[extensionName] = extension_settings[extensionName] || {};
    const settings = extension_settings[extensionName];

    // 迁移旧设置
    if (settings.promptInjection) {
        delete settings.promptInjection;
    }

    // 应用默认值
    for (const key in defaultSettings) {
        if (settings[key] === undefined) {
            settings[key] = defaultSettings[key];
        }
    }

    updateUI();
}

// 创建设置页面
async function createSettings(settingsHtml) {
    // 创建一个容器来存放设置，确保其正确显示在扩展设置面板中
    if (!$("#image_auto_generation_container").length) {
        $("#extensions_settings2").append('<div id="image_auto_generation_container" class="extension_container"></div>');
    }

    // 使用传入的settingsHtml而不是重新获取
    $("#image_auto_generation_container").empty().append(settingsHtml);

    // 添加设置变更事件处理
    $('#image_generation_insert_type').on('change', function () {
        extension_settings[extensionName].insertType = $(this).val();
        updateUI();
        saveSettingsDebounced();
    });

    $('#ai_prompt_generation').on('change', function () {
        extension_settings[extensionName].aiPromptGeneration = $(this).is(':checked');
        updateUI();
        saveSettingsDebounced();
    });

    $('#api_url').on('input', function () {
        extension_settings[extensionName].apiUrl = $(this).val();
        saveSettingsDebounced();
    });

    $('#api_key').on('input', function () {
        extension_settings[extensionName].apiKey = $(this).val();
        saveSettingsDebounced();
    });

    $('#model').on('change', function () {
        extension_settings[extensionName].model = $(this).val();
        saveSettingsDebounced();
    });

    $('#max_chat_history').on('input', function () {
        extension_settings[extensionName].maxChatHistory = Number($(this).val());
        saveSettingsDebounced();
    });

    $('#enable_world_info').on('change', function () {
        extension_settings[extensionName].enableWorldInfo = $(this).is(':checked');
        saveSettingsDebounced();
    });

    $('#ordered_prompts').on('input', function () {
        extension_settings[extensionName].orderedPrompts = $(this).val();
        saveSettingsDebounced();
    });

    $('#get_models_button').on('click', async function () {
        const settings = extension_settings[extensionName];
        if (!settings.apiUrl || !settings.apiKey) {
            toastr.error("请输入API URL和API密钥。");
            return;
        }

        try {
            let baseUrl = settings.apiUrl.trim();
            if (baseUrl.endsWith('/')) {
                baseUrl = baseUrl.slice(0, -1);
            }
            if (baseUrl.endsWith('/v1')) {
                baseUrl = baseUrl.slice(0, -3);
            }

            const response = await fetch(`${baseUrl}/v1/models`, {
                headers: {
                    'Authorization': `Bearer ${settings.apiKey}`
                }
            });
            const data = await response.json();
            const models = data.data.map(model => model.id);
            
            const $modelSelect = $('#model');
            $modelSelect.empty();
            models.forEach(model => {
                $modelSelect.append(`<option value="${model}">${model}</option>`);
            });

            // 自动选择第一个模型
            if (models.length > 0) {
                $modelSelect.val(models[0]);
                extension_settings[extensionName].model = models[0];
                saveSettingsDebounced();
            }

            toastr.info("可用模型列表已更新。");
        } catch (error) {
            toastr.error("获取模型列表失败。");
            console.error(error);
        }
    });

    $('#test_api_button').on('click', async function () {
        console.log("Test button clicked.");
        const settings = extension_settings[extensionName];
        if (!settings.apiUrl || !settings.apiKey || !settings.model) {
            toastr.error("请输入API URL、API密钥和模型。");
            console.log("Missing API settings.");
            return;
        }

        console.log("API settings found, proceeding with test.");
        try {
            let baseUrl = settings.apiUrl.trim();
            if (baseUrl.endsWith('/')) {
                baseUrl = baseUrl.slice(0, -1);
            }
            if (baseUrl.endsWith('/v1')) {
                baseUrl = baseUrl.slice(0, -3);
            }
            
            console.log(`Fetching from: ${baseUrl}/v1/chat/completions`);
            const response = await fetch(`${baseUrl}/v1/chat/completions`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${settings.apiKey}`
                },
                body: JSON.stringify({
                    model: settings.model,
                    messages: [{ role: 'user', content: 'hi' }]
                })
            });

            console.log("Fetch request sent, processing response.");
            if (response.ok) {
                toastr.success("API测试成功！");
                console.log("API test successful.");
            } else {
                const error = await response.json();
                toastr.error(`API测试失败: ${error.error.message}`);
                console.error("API test failed:", error);
            }
        } catch (error) {
            toastr.error("API测试失败。");
            console.error("An error occurred during API test:", error);
        }
    });


    // 初始化设置值
    updateUI();
}

// 设置变更处理函数
function onExtensionButtonClick() {
    // 直接访问扩展设置面板
    const extensionsDrawer = $('#extensions-settings-button .drawer-toggle');

    // 如果抽屉是关闭的，点击打开它
    if ($('#rm_extensions_block').hasClass('closedDrawer')) {
        extensionsDrawer.trigger('click');
    }

    // 等待抽屉打开后滚动到我们的设置容器
    setTimeout(() => {
        // 找到我们的设置容器
        const container = $('#image_auto_generation_container');
        if (container.length) {
            // 滚动到设置面板位置
            $('#rm_extensions_block').animate({
                scrollTop: container.offset().top - $('#rm_extensions_block').offset().top + $('#rm_extensions_block').scrollTop()
            }, 500);

            // 使用SillyTavern原生的抽屉展开方式
            // 检查抽屉内容是否可见
            const drawerContent = container.find('.inline-drawer-content');
            const drawerHeader = container.find('.inline-drawer-header');

            // 只有当内容被隐藏时才触发展开
            if (drawerContent.is(':hidden') && drawerHeader.length) {
                // 直接使用原生点击事件触发，而不做任何内部处理
                drawerHeader.trigger('click');
            }
        }
    }, 500);
}

// 初始化扩展
$(function () {
    (async function () {
        // 获取设置HTML (只获取一次)
        const settingsHtml = await $.get(`${extensionFolderPath}/settings.html`);

        // 添加扩展到菜单
        $("#extensionsMenu").append(`<div id="auto_generation" class="list-group-item flex-container flexGap5">
            <div class="fa-solid fa-robot"></div>
            <span data-i18n="Image Auto Generation">Image Auto Generation</span>
        </div>`);

        // 修改点击事件，打开设置面板而不是切换状态
        $("#auto_generation").off('click').on("click", onExtensionButtonClick);

        await loadSettings();

        // 创建设置 - 将获取的HTML传递给createSettings
        await createSettings(settingsHtml);

        // 确保设置面板可见时，设置值是正确的
        $('#extensions-settings-button').on('click', function () {
            setTimeout(() => {
                updateUI();
            }, 200);
        });
    })();
});
// 监听消息接收事件
eventSource.on(event_types.MESSAGE_RECEIVED, handleIncomingMessage);
async function handleIncomingMessage() {
    // 确保设置对象存在
    if (!extension_settings[extensionName] ||
        extension_settings[extensionName].insertType === INSERT_TYPE.DISABLED) {
        return;
    }

    const context = getContext();
    const message = context.chat[context.chat.length - 1];

    // 检查是否是AI消息
    if (!message || message.is_user) {
        return;
    }

    // 使用正则表达式search
    const imgTagRegex = /<pic[^>]*\sprompt="([^"]*)"[^>]*?>/g;
    let matches = [...message.mes.matchAll(imgTagRegex)].map(match => match[1]);
    console.log(imgTagRegex, matches)
    if (matches.length > 0) {
        // 延迟执行图片生成，确保消息首先显示出来
        setTimeout(async () => {
            try {
                toastr.info(`Generating ${matches.length} images...`);
                const settings = extension_settings[extensionName];
                const insertType = settings.insertType;


                // 在当前消息中插入图片
                // 初始化message.extra
                if (!message.extra) {
                    message.extra = {};
                }

                // 初始化image_swipes数组
                if (!Array.isArray(message.extra.image_swipes)) {
                    message.extra.image_swipes = [];
                }

                // 如果已有图片，添加到swipes
                if (message.extra.image && !message.extra.image_swipes.includes(message.extra.image)) {
                    message.extra.image_swipes.push(message.extra.image);
                }

                // 获取消息元素用于稍后更新
                const messageElement = $(`.mes[mesid="${context.chat.length - 1}"]`);

                // 处理每个匹配的图片标签
                for (let i = 0; i < matches.length; i++) {
                    let prompt = matches[i];

                    if (settings.aiPromptGeneration) {
                        const { generateRaw } = await import('../../../../power-user/script.js');
                        const orderedPrompts = settings.orderedPrompts.split('\n').map(p => p.trim()).filter(p => p);
                        if (settings.enableWorldInfo) {
                            orderedPrompts.unshift('world_info_before');
                            orderedPrompts.push('world_info_after');
                        }
                        
                        const generatedPrompt = await generateRaw({
                            should_stream: false,
                            custom_api: {
                                apiurl: settings.apiUrl,
                                key: settings.apiKey,
                                model: settings.model,
                            },
                            max_chat_history: settings.maxChatHistory,
                            ordered_prompts: orderedPrompts.map(p => ({ role: 'user', content: p.replace('{{prompt}}', prompt) })),
                        });
                        prompt = generatedPrompt;
                    }

                    // @ts-ignore
                    const result = await SlashCommandParser.commands['sd'].callback({ quiet: insertType === INSERT_TYPE.NEW_MESSAGE ? 'false' : 'true' }, prompt);
                    // 统一插入到extra里
                    if (insertType === INSERT_TYPE.INLINE) {
                        let imageUrl = result;
                        if (typeof imageUrl === 'string' && imageUrl.trim().length > 0) {
                            // 添加图片到swipes数组
                            message.extra.image_swipes.push(imageUrl);

                            // 设置第一张图片为主图片，或更新为最新生成的图片
                            message.extra.image = imageUrl;
                            message.extra.title = prompt;
                            message.extra.inline_image = true;

                            // 更新UI
                            appendMediaToMessage(message, messageElement);

                            // 保存聊天记录
                            await context.saveChat();
                        }
                    } else if (insertType === INSERT_TYPE.REPLACE) {
                        let imageUrl = result;
                        if (typeof imageUrl === 'string' && imageUrl.trim().length > 0) {
                            // Find the original image tag in the message
                            const originalTag = message.mes.match(imgTagRegex)[0];
                            // Replace it with an actual image tag
                            const newImageTag = `<img src="${imageUrl}" title="${prompt}" alt="${prompt}">`;
                            message.mes = message.mes.replace(originalTag, newImageTag);

                            // Update the message display using updateMessageBlock
                            updateMessageBlock(context.chat.length - 1, message);

                            // Save the chat
                            await context.saveChat();
                        }
                    }

                }
                toastr.success(`${matches.length} images generated successfully`);
            } catch (error) {
                toastr.error(`Image generation error: ${error}`);
                console.error('Image generation error:', error);
            }
        }, 0); //防阻塞UI渲染
    }
}
