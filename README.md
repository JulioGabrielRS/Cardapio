# Cardapio web com confirmacao por WhatsApp

App simples para uma pequena operacao de comida japonesa, com:

- cardapio online
- carrinho e checkout
- envio do resumo do pedido para o WhatsApp da loja
- status inicial como `aguardando confirmacao`
- painel da proprietaria para confirmar ou recusar
- pagina de acompanhamento do cliente

## Como rodar

```bash
node scripts/generate-hero.js
node server.js
```

Depois abra:

- `http://localhost:3000/`
- `http://localhost:3000/admin.html`
- `http://localhost:3000/pedido.html`

## Onde editar

Tudo principal fica em [data/store.json](</C:/Users/juliogrs/OneDrive - FAZENDA AGUA SANTA/Documentos/New project/data/store.json>).

Troque estes campos antes de usar de verdade:

- `business.name`
- `business.whatsapp`
- `business.address`
- `business.hours`
- `business.deliveryFee`
- `business.minimumOrder`
- `owner.adminPin`
- `categories`

Os pedidos ficam salvos em [data/orders.json](</C:/Users/juliogrs/OneDrive - FAZENDA AGUA SANTA/Documentos/New project/data/orders.json>).

## Como funciona o WhatsApp

No fluxo atual, o site abre o WhatsApp com a mensagem do pedido pronta para envio ao numero da loja.

Isso funciona bem para uma operacao pequena e sem integracao paga, mas tem uma limitacao importante:

- a mensagem nao e enviada de forma totalmente automatica pelo navegador
- o cliente ainda precisa confirmar o envio no WhatsApp

Se voce quiser envio 100% automatico, o proximo passo e integrar a API oficial do WhatsApp Business ou um provedor como Twilio.

## PIN do painel

O exemplo sai com PIN `2468` em `data/store.json`. Troque antes de usar fora de teste.
