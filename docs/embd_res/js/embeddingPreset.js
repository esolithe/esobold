// List compiled thanks to Vic49
let embeddingPresets = {
    "stella_en_1.5B_v5": {
        "document_prompt": null,
        "query_prompt": "Instruct: Given a web search query, retrieve relevant passages that answer the query.\nQuery: "
    },
    "stella_en_1.5B": {
        "document_prompt": null,
        "query_prompt": "Instruct: Given a web search query, retrieve relevant passages that answer the query.\nQuery: "
    },
    "bge-code-v1": {
        "document_prompt": null,
        "query_prompt": "<instruct>Given a question in text, retrieve relevant code that is relevant.\n<query>"
    },
    "bge-large-en-v1.5": {
        "document_prompt": null,
        "query_prompt": "Represent this sentence for searching relevant passages: "
    },
    "bge-base-en-v1.5": {
        "document_prompt": null,
        "query_prompt": "Represent this sentence for searching relevant passages: "
    },
    "bge-small-en-v1.5": {
        "document_prompt": null,
        "query_prompt": "Represent this sentence for searching relevant passages: "
    },
    "snowflake-arctic-embed-l-v2.0": {
        "document_prompt": null,
        "query_prompt": "query: "
    },
    "snowflake-arctic-embed-m-v1.5": {
        "document_prompt": null,
        "query_prompt": "Represent this sentence for searching relevant passages: "
    },
    "snowflake-arctic-embed-m": {
        "document_prompt": null,
        "query_prompt": "Represent this sentence for searching relevant passages: "
    },
    "snowflake-arctic-embed-s": {
        "document_prompt": null,
        "query_prompt": "Represent this sentence for searching relevant passages: "
    },
    "snowflake-arctic-embed-xs": {
        "document_prompt": null,
        "query_prompt": "Represent this sentence for searching relevant passages: "
    },
    "gte-Qwen2-1.5B-instruct": {
        "document_prompt": null,
        "query_prompt": "Instruct: Given a web search query, retrieve relevant passages that answer the query\nQuery: "
    },
    "granite-embedding-125m-english": {
        "document_prompt": null,
        "query_prompt": null
    },
    "granite-embedding-30m-english": {
        "document_prompt": null,
        "query_prompt": null
    },
    "granite-embedding-278m-multilingual": {
        "document_prompt": null,
        "query_prompt": null
    },
    "granite-embedding-107m-multilingual": {
        "document_prompt": null,
        "query_prompt": null
    },
    "e5-large-v2": {
        "document_prompt": "passage: ",
        "query_prompt": "query: "
    },
    "e5-base-v2": {
        "document_prompt": "passage: ",
        "query_prompt": "query: "
    },
    "e5-small-v2": {
        "document_prompt": "passage: ",
        "query_prompt": "query: "
    },
    "jina-embeddings-v2-base-en": {
        "document_prompt": null,
        "query_prompt": null
    },
    "jina-embeddings-v2-base-code": {
        "document_prompt": null,
        "query_prompt": null
    },
    "jina-embeddings-v2-small-en": {
        "document_prompt": null,
        "query_prompt": null
    },
    "mxbai-embed-large-v1": {
        "document_prompt": null,
        "query_prompt": "Represent this sentence for searching relevant passages: "
    },
    "mxbai-embed-xsmall-v1": {
        "document_prompt": null,
        "query_prompt": null
    },
    "nomic-embed-text-v1.5": {
        "document_prompt": "search_document: ",
        "query_prompt": "search_query: "
    },
    "nomic-embed-text-v2-moe": {
        "document_prompt": "search_document: ",
        "query_prompt": "search_query: "
    },
    "nomic-embed-code": {
        "document_prompt": null,
        "query_prompt": "Represent this query for searching relevant code: "
    },
    "all-MiniLM-L12-v2": {
        "document_prompt": null,
        "query_prompt": null
    },
    "all-MiniLM-L6-v2": {
        "document_prompt": null,
        "query_prompt": null
    },
    "kalm-embedding-multilingual-mini-instruct-v1.5": {
        "document_prompt": null,
        "query_prompt": null
    },
    "SFR-Embedding-Mistral": {
        "document_prompt": null,
        "query_prompt": "Instruct: Given a web search query, retrieve relevant passages that answer the query.\nQuery: "
    }
}

let getEmbeddingPresetFromModel = () => {
    if (get_kcpp_embedding_model() !== false) {
        let embeddingPreset = embeddingPresets[Object.keys(embeddingPresets).filter(presetName => !!get_kcpp_embedding_model()?.includes(presetName))]
        if (!!embeddingPreset && (!documentdb_sqPrefix && !documentdb_cPrefix)) {
            documentdb_sqPrefix = embeddingPreset.query_prompt
            documentdb_cPrefix = embeddingPreset.document_prompt
        }
    }
}

let originalButtonForMemory = btn_memory, firstLoad = true
btn_memory = () => {
    getEmbeddingPresetFromModel()
    originalButtonForMemory()
}