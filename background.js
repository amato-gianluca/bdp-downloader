const base_url = 'https://bdp.giustizia.it/api/bdm/frontoffice/'

const QUERY_SEARCH_PROVVEDIMENTO = `
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

browser.webRequest.onBeforeRequest.addListener(
    networkRequestsListener,
    { urls: [base_url + 'graphql'] },
    ['requestBody', 'blocking']
)

browser.runtime.onMessage.addListener(messageListener)

let queries = {}

function parseCookies(header) {
    const dict = {}
    const cookies = header.split(';')
    for (let cookie of cookies) {
        let [name, value] = cookie.split('=').map(part => part.trim())
        dict[name] = value
    }
    return dict
}

function networkRequestsListener(requestDetails) {
    const tabId = requestDetails.tabId
    if (tabId == -1) return
    if (requestDetails.requestBody) {
        const requestBody = requestDetails.requestBody
        if (requestBody.raw) {
            const decoder = new TextDecoder('utf-8')
            const body = JSON.parse(requestBody.raw.map((part) => decoder.decode(part.bytes)).join(''))
            const query = body.variables.q
            queries[tabId] = query
        }

        const data = []
        const filter = browser.webRequest.filterResponseData(requestDetails.requestId)
        filter.ondata = event => {
            data.push(event.data)
            filter.write(event.data)
        }

        filter.onstop = event => {
            let concatenated = new Uint8Array(data.reduce((acc, part) => acc + part.byteLength, 0))
            let offset = 0;
            for (let part of data) {
                concatenated.set(new Uint8Array(part), offset)
                offset += part.byteLength
            }
            const response = JSON.parse(new TextDecoder('utf-8').decode(concatenated))
            browser.tabs.sendMessage(tabId, { command: 'storeQuery', query: queries[tabId], total: response.data.provvedimento.count })
            filter.disconnect()
        }
    }
    return {}
}

function messageListener(message, sender, sendResponse) {
    console.log(message)
    switch (message.command) {
        case 'start':
            break
        case 'download':
            downloadProvvedimenti(sender.tab.id, message.start, message.stop)
            break
        default:
            console.error('Unknown command: ' + message.command)
    }
}

async function downloadProvvedimenti(tabId, start, stop) {
    query = queries[tabId]
    if (query == null) return
    browser.tabs.sendMessage(tabId, { command: "startDownload" })
    let all_items = []
    let current_item = start
    let downloaded = 0
    while (current_item <= stop) {
        const response = await searchProvvedimenti(query, current_item-1, stop - current_item + 1)
        const items = response.data.provvedimento.items
        all_items = all_items.concat(items)
        for (const item of items) {
            browser.tabs.sendMessage(tabId, { command: 'progressDownload', current: current_item, total: stop })
            const url = base_url + 'provvedimento/' + item.id + '/document'
            const filename = item.id + ".pdf"
            const donwloadItems = await browser.downloads.search({ url: url, limit: 1, exists: true })
            if (donwloadItems.length == 0) {
                downloaded += 1
                try {
                    const downloadId = await browser.downloads.download({
                        url: url,
                        filename: filename,
                        conflictAction: 'overwrite',
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
                        browser.downloads.onChanged.addListener(onChanged)
                    })
                    await downloadPromise
                } catch (error) {
                    console.error(`Error downloading ${url}: ${error}`)
                }
            }
            current_item += 1
        }
    }
    const blob = new Blob([JSON.stringify(all_items, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    await browser.downloads.download({
        url: url,
        filename: 'results.json',
        conflictAction: 'overwrite',
    })
    browser.tabs.sendMessage(tabId, { command: 'stopDownload', current: current_item - 1, total: stop, downloaded: downloaded })
}

async function searchProvvedimenti(query, start = 0, size = 10) {
    const query_json = {
        'operationName': 'searchProvvedimento',
        'variables': {
            'from': start,
            'size': size,
            'note_personali': null,
            'area': 'CIVILE',
            'q': query,
            'sort_field': 'data',
            'sort_order': 'desc',
            'collated': false,
        },
        'query': QUERY_SEARCH_PROVVEDIMENTO
    }
    const params = {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(query_json)
    }
    const response = await fetch(base_url + 'graphql', params)
    return response.json()
}
