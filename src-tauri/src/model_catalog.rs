//! Provider presets and internal reference limits for workshop requests.
//! Output limits are managed by the application, not exposed as user settings.
use serde_json::{json, Value};

/// Reference limits for one model family.
#[derive(Debug, PartialEq, Eq)]
pub struct Limits {
    pub context: u32,
    pub output: u32,
}

// (model id prefix, label, context window, max output tokens, reasoning model)
const MODELS: &[(&str, &str, u32, u32, bool)] = &[
    ("gpt-5.1", "GPT-5.1", 400_000, 128_000, true),
    ("gpt-5", "GPT-5", 400_000, 128_000, true),
    ("gpt-4.1", "GPT-4.1", 1_047_576, 32_768, false),
    ("gpt-4o", "GPT-4o", 128_000, 16_384, false),
    ("o4-mini", "o4-mini", 200_000, 100_000, true),
    ("o3", "o3", 200_000, 100_000, true),
    ("claude", "Claude", 200_000, 64_000, true),
    ("deepseek-reasoner", "DeepSeek R1", 131_072, 65_536, true),
    ("deepseek", "DeepSeek", 131_072, 8_192, false),
    ("qwq", "QwQ", 131_072, 32_768, true),
    ("qwen", "Qwen", 131_072, 32_768, false),
    ("glm", "GLM", 131_072, 16_384, false),
    ("kimi", "Kimi", 262_144, 32_768, false),
    ("moonshot", "Moonshot", 131_072, 16_384, false),
    ("gemini", "Gemini", 1_048_576, 65_536, false),
    ("llama", "Llama", 131_072, 16_384, false),
    ("magistral", "Magistral", 131_072, 32_768, true),
    ("mistral", "Mistral", 131_072, 32_768, false),
    ("devstral", "Devstral", 131_072, 32_768, false),
    ("grok", "Grok", 262_144, 32_768, false),
    ("minimax", "MiniMax", 1_000_000, 40_000, false),
    ("doubao", "豆包", 262_144, 32_768, false),
    ("step-", "阶跃星辰", 65_536, 16_384, false),
    ("ernie", "文心", 131_072, 8_192, false),
    ("hunyuan", "混元", 131_072, 16_384, false),
    ("spark", "星火", 32_768, 8_192, false),
    ("command", "Command", 128_000, 4_096, false),
    ("sonar", "Sonar", 127_072, 8_192, false),
    ("yi-", "Yi", 32_768, 4_096, false),
];

/// Longest-prefix match so `deepseek-reasoner` wins over `deepseek`.
/// Gateways hand out namespaced ids such as `vendor/model-name`; the segment after the
/// last slash names the model family, so it is preferred over the vendor namespace.
pub fn limits(model: &str) -> Option<Limits> {
    let model = model.trim().to_ascii_lowercase();
    if model.is_empty() {
        return None;
    }
    let base = model.rsplit('/').next().unwrap_or(&model);
    let best = |text: &str| {
        MODELS
            .iter()
            .filter(|(prefix, ..)| text.starts_with(prefix))
            .max_by_key(|(prefix, ..)| prefix.len())
    };
    best(base)
        .or_else(|| best(&model))
        .map(|(_, _, context, output, _)| Limits {
            context: *context,
            output: *output,
        })
}

// (preset id, display name, base URL, local service)
const PRESETS: &[(&str, &str, &str, bool)] = &[
    ("openai", "OpenAI", "https://api.openai.com/v1", false),
    ("deepseek", "DeepSeek", "https://api.deepseek.com/v1", false),
    (
        "moonshot",
        "Moonshot Kimi",
        "https://api.moonshot.cn/v1",
        false,
    ),
    (
        "zhipu",
        "智谱 GLM",
        "https://open.bigmodel.cn/api/paas/v4",
        false,
    ),
    (
        "dashscope",
        "阿里云百炼",
        "https://dashscope.aliyuncs.com/compatible-mode/v1",
        false,
    ),
    (
        "siliconflow",
        "SiliconFlow 硅基流动",
        "https://api.siliconflow.cn/v1",
        false,
    ),
    (
        "volcengine",
        "火山方舟",
        "https://ark.cn-beijing.volces.com/api/v3",
        false,
    ),
    (
        "openrouter",
        "OpenRouter",
        "https://openrouter.ai/api/v1",
        false,
    ),
    ("groq", "Groq", "https://api.groq.com/openai/v1", false),
    ("mistral", "Mistral", "https://api.mistral.ai/v1", false),
    ("xai", "xAI Grok", "https://api.x.ai/v1", false),
    (
        "together",
        "Together AI",
        "https://api.together.xyz/v1",
        false,
    ),
    (
        "perplexity",
        "Perplexity",
        "https://api.perplexity.ai",
        false,
    ),
    ("custom", "自定义服务", "", false),
    (
        "ollama",
        "Ollama（本机）",
        "http://localhost:11434/v1",
        true,
    ),
    (
        "lmstudio",
        "LM Studio（本机）",
        "http://localhost:1234/v1",
        true,
    ),
    ("vllm", "vLLM（本机）", "http://localhost:8000/v1", true),
];

/// Presets and the reference limit table, fetched once when the settings page opens.
pub fn catalog() -> Value {
    json!({
        "presets": PRESETS.iter().map(|(id, name, endpoint, local)| json!({
            "id": id, "name": name, "endpoint": endpoint, "local": local
        })).collect::<Vec<_>>(),
        "models": MODELS.iter().map(|(prefix, label, context, output, reasoning)| json!({
            "prefix": prefix, "label": label, "context": context, "output": output, "reasoning": reasoning
        })).collect::<Vec<_>>(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn the_most_specific_model_family_wins() {
        assert_eq!(limits("DeepSeek-Reasoner").unwrap().output, 65_536);
        assert_eq!(limits("deepseek-chat").unwrap().output, 8_192);
        assert_eq!(limits("gpt-4o-mini").unwrap().output, 16_384);
        assert!(limits("unknown-model").is_none());
    }
    #[test]
    fn namespaced_gateway_ids_still_match_their_family() {
        assert_eq!(
            limits("deepseek/deepseek-v4.1-flash").unwrap().output,
            8_192
        );
        assert_eq!(
            limits("moonshotai/Kimi-K3").unwrap(),
            limits("Kimi-K3").unwrap()
        );
        assert_eq!(
            limits("zai-org/GLM-5.3").unwrap(),
            limits("GLM-5.3").unwrap()
        );
        assert_eq!(
            limits("Qwen/Qwen3.8-Max").unwrap(),
            limits("Qwen3.8-Max").unwrap()
        );
        assert_eq!(
            limits("MiniMaxAI/MiniMax-M3").unwrap(),
            limits("MiniMax-M3").unwrap()
        );
        assert_eq!(
            limits("vendor/claude-sonnet-5").unwrap(),
            limits("claude-sonnet-5").unwrap()
        );
    }
    #[test]
    fn every_preset_is_an_acceptable_endpoint_shape() {
        for (id, name, endpoint, local) in PRESETS {
            assert!(!name.is_empty() && !id.is_empty());
            if *local {
                assert!(endpoint.starts_with("http://localhost:"), "{id}");
            } else {
                assert!(
                    endpoint.is_empty() || endpoint.starts_with("https://"),
                    "{id}"
                );
            }
        }
    }
}
