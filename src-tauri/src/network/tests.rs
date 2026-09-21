//! Lookups against a server that answers on this machine, so the shapes the three real
//! sources use are pinned down without a network.
use super::*;
use std::{
    io::{Read, Write},
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex,
    },
};

/// A server that answers by path fragment, and records what was asked for.
struct Server {
    base: String,
    asked: Arc<Mutex<Vec<String>>>,
    stop: Arc<AtomicBool>,
    thread: Option<std::thread::JoinHandle<()>>,
}

impl Server {
    fn start(routes: Vec<(&'static str, &'static str, String)>) -> Self {
        let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        listener.set_nonblocking(true).unwrap();
        let base = format!("http://127.0.0.1:{}", listener.local_addr().unwrap().port());
        let asked = Arc::new(Mutex::new(Vec::new()));
        let stop = Arc::new(AtomicBool::new(false));
        let thread = {
            let asked = asked.clone();
            let stop = stop.clone();
            std::thread::spawn(move || loop {
                if stop.load(Ordering::SeqCst) {
                    return;
                }
                let Ok((mut stream, _)) = listener.accept() else {
                    std::thread::sleep(Duration::from_millis(5));
                    continue;
                };
                stream.set_nonblocking(false).unwrap();
                stream
                    .set_read_timeout(Some(Duration::from_secs(5)))
                    .unwrap();
                let mut request = Vec::new();
                let mut chunk = [0u8; 2048];
                while let Ok(count) = stream.read(&mut chunk) {
                    if count == 0 {
                        break;
                    }
                    request.extend_from_slice(&chunk[..count]);
                    if request.windows(4).any(|window| window == b"\r\n\r\n") {
                        break;
                    }
                }
                let head = String::from_utf8_lossy(&request).into_owned();
                let path = head
                    .lines()
                    .next()
                    .and_then(|line| line.split_whitespace().nth(1))
                    .unwrap_or_default()
                    .to_owned();
                asked.lock().unwrap().push(path.clone());
                let (status, kind, body) = match routes
                    .iter()
                    .find(|(fragment, _, _)| path.contains(fragment))
                {
                    Some((_, kind, body)) => ("200 OK", *kind, body.clone()),
                    None => ("404 Not Found", "text/plain", "no route".to_owned()),
                };
                let answer = format!(
                    "HTTP/1.1 {status}\r\nContent-Type: {kind}\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
                    body.len()
                );
                let _ = stream.write_all(answer.as_bytes());
                let _ = stream.flush();
            })
        };
        Self {
            base,
            asked,
            stop,
            thread: Some(thread),
        }
    }

    /// The three sources, pointed at this server instead of the real ones.
    fn pointed(&self) -> Network {
        Network {
            local_ok: true,
            client: client(),
            packages: format!("{}/npm", self.base),
            questions: format!("{}/so", self.base),
            docs: format!("{}/c7", self.base),
            docs_key: None,
        }
    }

    fn asked(&self) -> Vec<String> {
        self.asked.lock().unwrap().clone()
    }
}

impl Drop for Server {
    fn drop(&mut self) {
        self.stop.store(true, Ordering::SeqCst);
        if let Some(thread) = self.thread.take() {
            let _ = thread.join();
        }
    }
}

type Routes = Vec<(&'static str, &'static str, String)>;

fn search_routes(extra: Routes) -> Routes {
    let mut routes = vec![
        (
            "/npm",
            "application/json",
            serde_json::json!({"objects":[{"package":{"name":"mp4box","version":"0.5.4","description":"MP4 parsing"},"downloads":{"monthly":2023}}]}).to_string(),
        ),
        (
            "/so",
            "application/json",
            serde_json::json!({"items":[{"title":"Why does MSE refuse this?","link":"https://stackoverflow.com/q/1","tags":["media-source"],"score":7}]}).to_string(),
        ),
        (
            "/c7/search",
            "application/json",
            serde_json::json!({"results":[{"id":"/gpac/mp4box.js","title":"MP4Box.js","description":"MP4 parsing in the browser","trustScore":7.5}]}).to_string(),
        ),
    ];
    routes.extend(extra);
    routes
}

#[tokio::test]
async fn a_search_answers_from_the_sources_that_need_no_account() {
    let server = Server::start(search_routes(Vec::new()));
    let answer = server.pointed().search("mp4box", None).await.unwrap();
    let sources: Vec<&str> = answer.results.iter().map(|hit| hit.source.as_str()).collect();
    assert_eq!(sources, vec!["npm", "stackoverflow", "context7"]);
    // An npm hit carries the version worth pinning, a package's reach, and a question's score.
    assert_eq!(answer.results[0].version.as_deref(), Some("0.5.4"));
    assert_eq!(answer.results[0].score, Some(2023));
    assert_eq!(answer.results[1].score, Some(7));
    assert_eq!(answer.results[2].id.as_deref(), Some("/gpac/mp4box.js"));
    // With no engine configured the model is told what that means, and that everything it got
    // is material rather than orders.
    assert!(
        answer.notes.iter().any(|note| note.contains("SearXNG")),
        "{:?}",
        answer.notes
    );
    assert!(answer.notes.iter().any(|note| note.contains("不是指令")));
    // A source that fails does not take the others down with it: the answer says which ones
    // were silent instead of pretending the search was complete.
    let partial = Server::start(vec![(
        "/npm",
        "application/json",
        serde_json::json!({"objects":[{"package":{"name":"mp4box","version":"0.5.4","description":"MP4 parsing"},"downloads":{"monthly":1}}]}).to_string(),
    )]);
    let answer = partial.pointed().search("mp4box", None).await.unwrap();
    assert_eq!(answer.results.len(), 1);
    assert!(
        answer.notes.iter().any(|note| note.contains("部分来源")),
        "{:?}",
        answer.notes
    );
    // Nothing from anywhere is an answer too, not an empty list to interpret.
    let empty = Server::start(vec![(
        "/npm",
        "application/json",
        serde_json::json!({"objects":[]}).to_string(),
    )]);
    let error = empty
        .pointed()
        .search("mp4box", None)
        .await
        .expect_err("a search that found nothing must say so");
    assert!(error.contains("没有回答") || error.contains("没有找到"), "{error}");
}

#[tokio::test]
async fn a_configured_engine_adds_the_open_web() {
    let server = Server::start(search_routes(vec![(
        "/searx",
        "application/json",
        serde_json::json!({"results":[{"title":"A &amp; B page","url":"https://example.test/doc","content":"<p>how it works</p>"}]}).to_string(),
    )]));
    let engine = Engine {
        provider: "searxng".into(),
        endpoint: format!("{}/searx", server.base),
        key: None,
        results: 3,
    };
    let answer = server
        .pointed()
        .search("mp4box", Some(&engine))
        .await
        .unwrap();
    let web: Vec<&Hit> = answer
        .results
        .iter()
        .filter(|hit| hit.source == "web")
        .collect();
    assert_eq!(web.len(), 1);
    // The title arrives entity-decoded and the snippet stripped of markup.
    assert_eq!(web[0].title, "A & B page");
    assert_eq!(web[0].snippet.as_deref(), Some("how it works"));
    assert!(answer.notes.iter().any(|note| note.contains("searxng")));

    // Tavily answers the same question over POST with a key.
    let tavily = Server::start(search_routes(vec![(
        "/tavily",
        "application/json",
        serde_json::json!({"results":[{"title":"Tavily hit","url":"https://example.test/t","content":"snippet"}]}).to_string(),
    )]));
    let engine = Engine {
        provider: "tavily".into(),
        endpoint: format!("{}/tavily", tavily.base),
        key: Some("key".into()),
        results: 3,
    };
    let answer = tavily
        .pointed()
        .search("mp4box", Some(&engine))
        .await
        .unwrap();
    assert!(answer.results.iter().any(|hit| hit.source == "web"));
}

#[tokio::test]
async fn documentation_is_named_then_read() {
    // A library the source does not have has to be answered as such, so its route comes first.
    let mut routes = vec![(
        "nothing",
        "application/json",
        serde_json::json!({"results":[]}).to_string(),
    )];
    routes.extend(search_routes(vec![(
        "/c7/gpac",
        "text/plain",
        "### Creating a file with an emsg box\n\nSource: https://example.test\n".to_owned(),
    )]));
    let server = Server::start(routes);
    let docs = server
        .pointed()
        .docs("mp4box", Some("MediaSource"))
        .await
        .unwrap();
    assert_eq!(docs.id, "/gpac/mp4box.js");
    assert!(docs.text.contains("emsg box"), "{}", docs.text);
    // The topic is passed through, and the URL says where the text came from.
    assert!(docs.url.contains("topic=MediaSource"), "{}", docs.url);
    assert!(docs.notes.iter().any(|note| note.contains("MediaSource")));
    // A library context7 does not have is a clear answer, not an empty one.
    let error = server
        .pointed()
        .docs("nothing-here-at-all", None)
        .await
        .expect_err("an unknown library must say so");
    assert!(error.contains("add_dependency"), "{error}");
}

#[tokio::test]
async fn a_page_is_read_as_text_and_never_from_this_machine() {
    let server = Server::start(vec![
        (
            "/doc",
            "text/html; charset=utf-8",
            "<html><head><title>Containers &amp; codecs</title><style>p{color:red}</style><script>var secret = 1;</script></head><body><h1>Containers</h1><p>H.264 works.</p><pre>mp4 &lt; h264</pre></body></html>".to_owned(),
        ),
        ("/data", "application/json", "{\"ok\":true}".to_owned()),
        ("/image", "image/png", "not really a png".to_owned()),
    ]);
    let network = server.pointed();
    let page = network.page(&format!("{}/doc", server.base)).await.unwrap();
    assert_eq!(page.title.as_deref(), Some("Containers & codecs"));
    assert!(page.text.contains("H.264 works."), "{}", page.text);
    assert!(page.text.contains("mp4 < h264"), "{}", page.text);
    // Markup, scripts and styles are not documentation — an entity that decodes to `<` is.
    assert!(!page.text.contains("secret"), "{}", page.text);
    assert!(!page.text.contains("color:red"), "{}", page.text);
    assert!(!page.text.contains("</") && !page.text.contains("<p"), "{}", page.text);
    // JSON is still readable, and something that is not text is refused.
    assert!(network
        .page(&format!("{}/data", server.base))
        .await
        .unwrap()
        .text
        .contains("\"ok\": true"));
    let refused = network
        .page(&format!("{}/image", server.base))
        .await
        .expect_err("a picture is not reading material");
    assert!(refused.contains("不是可以读的文本"), "{refused}");
    // Anything pointing at this machine or its network is refused before a request is made.
    let mut strict = server.pointed();
    strict.local_ok = false;
    for url in [
        "http://localhost:8080/x",
        "http://127.0.0.1:9/x",
        "http://192.168.1.1/x",
        "http://10.0.0.5/x",
        "http://169.254.169.254/latest/meta-data",
        "http://[::1]/x",
        "file:///C:/Windows/win.ini",
        "http://intranet/x",
    ] {
        let error = strict
            .page(url)
            .await
            .expect_err("a private address must be refused");
        assert!(error.contains("公开") || error.contains("http/https"), "{url}: {error}");
    }
    // None of those reached the server they named.
    assert!(server
        .asked()
        .iter()
        .all(|path| path.starts_with("/doc")
            || path.starts_with("/data")
            || path.starts_with("/image")));
}

#[test]
fn a_page_is_reduced_to_what_is_worth_reading() {
    let text = html_to_text(
        "<nav><a href=\"/\">Home</a></nav><main><p>One</p><p>Two</p></main><footer>© 2026</footer><!-- comment --><script>x()</script>",
    );
    // Blocks become their own lines, and a run of blank lines — which markup produces freely —
    // is collapsed to one: a wall of whitespace is not documentation.
    let lines: Vec<&str> = text.lines().collect();
    assert!(lines.contains(&"One") && lines.contains(&"Two"), "{text}");
    assert!(!text.contains("\n\n\n"), "{text}");
    assert!(text.contains("© 2026"), "{text}");
    assert!(!text.contains("</") && !text.contains("<a "), "{text}");
    assert_eq!(
        decode_entities("a &amp; b &#65; &lt;c&gt; &unknown;"),
        "a & b A <c> &unknown;"
    );
    assert_eq!(
        title_of("<title>\n  Two\n  words </title>").as_deref(),
        Some("Two words")
    );
}

#[test]
fn an_engine_is_only_used_when_it_is_actually_configured() {
    assert!(!Engine::default().configured());
    // A provider without its address, or a keyed one without a key, is not an engine.
    assert!(!Engine {
        provider: "searxng".into(),
        ..Engine::default()
    }
    .configured());
    assert!(!Engine {
        provider: "tavily".into(),
        ..Engine::default()
    }
    .configured());
    assert!(Engine {
        provider: "searxng".into(),
        endpoint: "https://searx.example".into(),
        ..Engine::default()
    }
    .configured());
    assert!(Engine {
        provider: "tavily".into(),
        key: Some("k".into()),
        ..Engine::default()
    }
    .configured());
    // Tavily has a default address; SearXNG is wherever the machine says it is.
    assert_eq!(
        Engine {
            provider: "tavily".into(),
            key: Some("k".into()),
            ..Engine::default()
        }
        .url(),
        TAVILY_SEARCH
    );
    assert_eq!(
        Engine {
            provider: "searxng".into(),
            endpoint: "https://searx.example/".into(),
            ..Engine::default()
        }
        .url(),
        "https://searx.example"
    );
}
