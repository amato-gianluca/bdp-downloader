const base_url = "https://bdp.giustizia.it/api/bdm/frontoffice/"

let jwt = null
let query = null

QUERY_SEARCH_PROVVEDIMENTO = `
query searchProvvedimento($from: Int, $size: Int, $area: String, $q: String, $sort_field: String, $sort_order: String, $collated: Boolean, $note_personali: String) {
  provvedimento(
    from: $from
    size: $size
    area: $area
    q: $q
    sort_field: $sort_field
    sort_order: $sort_order
    collated: $collated
    note_personali: $note_personali
  ) {
    count
    items {
      ...SearchProvvedimentoResultItem
      __typename
    }
    __typename
  }
}

fragment ProvvedimentoIdDoc on Provvedimento {
  id
  anonymized_document_hash
  __typename
}

fragment ProvvedimentoItem on Provvedimento {
  ufficio
  materia
  presidente
  relatore
  giudice_assegnatario_fascicolo
  parola_chiave
  riferimento_normativo
  stato
  __typename
}

fragment ProvvedimentoItemTitle on Provvedimento {
  id
  ufficio
  area
  tipo
  data
  data_pubblicazione
  numero_provvedimento
  anno_provvedimento
  numero_ruolo
  anno_ruolo
  sub_procedimento
  __typename
}

fragment ProvvedimentoIdDocDocNote on Provvedimento {
  id
  anonymized_document_hash
  anonymized_document_note {
    _id
    author {
      upn
      name
      family_name
      email
      __typename
    }
    file_hash
    page_number
    color
    text
    participant {
      upn
      name
      family_name
      email
      permission
      __typename
    }
    rotated_rect {
      angle
      rect
      __typename
    }
    last_update_upn
    last_update_date
    __typename
  }
  __typename
}

fragment MassimaItemTitle on Massima {
  id
  area
  tipo
  titolo
  materia
  data
  data_pubblicazione
  numero_provvedimento
  anno_provvedimento
  numero_ruolo
  anno_ruolo
  sub_procedimento
  ufficio
  __typename
}

fragment SearchProvvedimentoResultItem on Provvedimento {
  id
  tipo
  numero_provvedimento
  anno_provvedimento
  numero_ruolo
  anno_ruolo
  sub_procedimento
  ufficio
  data
  data_pubblicazione
  estratto
  riferimento_normativo
  note
  materia
  parola_chiave
  anonymized_document_hash
  stato
  ...ProvvedimentoIdDoc
  ...ProvvedimentoItem
  ...ProvvedimentoItemTitle
  ...ProvvedimentoIdDocDocNote
  massima: massimaByProvvedimento {
    id
    titolo
    ...MassimaItemTitle
    __typename
  }
  __typename
}
`

function parseCookies(header) {
    dict = {}
    const cookies = header.split(';')
    for (let cookie of cookies) {
        let [name, value] = cookie.split('=').map(part => part.trim())
        dict[name] = value
    }
    return dict
}

function logRequestDetails(details) {
    if (details.requestHeaders) {
        for (let header of details.requestHeaders) {
            if (header.name.toLowerCase() === "cookie") {
                let cookies = parseCookies(header.value)
                jwt = cookies['jwt_bdm_frontoffice']
                console.log(jwt)
            }
        }
    }

    if (details.requestBody) {
        let requestBody = details.requestBody;
        if (requestBody.raw) {
            let decoder = new TextDecoder("utf-8");
            let body = requestBody.raw.map((part) => decoder.decode(part.bytes)).join('');
            let data = JSON.parse(body)
            query = data.variables.q
            console.log(query)
        }
    }
}

browser.webRequest.onBeforeSendHeaders.addListener(
    logRequestDetails,
    { urls: [base_url + "*"] },
    ["requestHeaders"]
);

browser.webRequest.onBeforeRequest.addListener(
    logRequestDetails,
    { urls: [base_url + "*"] },
    ["requestBody"]
);

browser.runtime.onMessage.addListener((message, sender, sendResponse) => downloadProvvedimenti(message))

async function downloadProvvedimenti(message) {
    console.log(message)
    if (message.command === "downloadList" && query !== null) {
        const items = await searchProvvedimenti(query)
        console.log('Total count2: ' + items.data.provvedimento.count)
        console.log('Real count: ' + items.data.provvedimento.items.length)
        for (const item of items.data.provvedimento.items) {
            try {
                const downloadId = await browser.downloads.download({
                    url: base_url + 'provvedimento/' + item.id + '/document',
                    filename: item.id + ".pdf",
                    conflictAction: "uniquify"
                })
                const downloadPromise = new Promise((resolve, reject) => {
                    function onChanged(delta) {
                        if (delta.id === downloadId && delta.state && delta.state.current === "complete") {
                            browser.downloads.onChanged.removeListener(onChanged);
                            console.log(`Completed downloading: ${downloadId}`);
                            resolve();
                        } else if (delta.id === downloadId && delta.error) {
                            browser.downloads.onChanged.removeListener(onChanged);
                            console.error(`Error downloading ${url}: ${delta.error.current}`);
                            reject(delta.error.current);
                        }
                    }
                    browser.downloads.onChanged.addListener(onChanged);
                })
                await downloadPromise
            } catch (error) {
                console.error(`Error downloading ${url}: ${error}`);
            }
        }
    }
}

async function searchProvvedimenti(query, start = 0, size = 2) {
    const query_json = {
        "operationName": "searchProvvedimento",
        "variables": {
            "from": start,
            "size": size,
            "note_personali": null,
            "area": "CIVILE",
            "q": query,
            "sort_field": "data",
            "sort_order": "desc",
            "collated": false,
        },
        "query": QUERY_SEARCH_PROVVEDIMENTO
    }
    const params = {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify(query_json)
    }
    const response = await fetch(base_url + 'graphql', params)
    return response.json()
}
