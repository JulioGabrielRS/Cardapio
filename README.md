# Cardapio web com confirmacao por WhatsApp

Aplicacao web para uma pequena operacao de comida japonesa com:

- cardapio online
- carrinho e checkout
- envio do resumo do pedido para o WhatsApp da loja
- acompanhamento de status pelo cliente
- painel da proprietaria com PIN para confirmar, recusar ou marcar como pronto

## Estrutura

- `server.js`: servidor HTTP e API
- `public/`: telas do cliente e da administracao
- `data/store.example.json`: configuracao base da loja
- `scripts/generate-hero.js`: geracao da imagem principal

## Como rodar

Este projeto nao depende de pacotes externos.

```bash
npm start
```

Na primeira execucao, se `data/store.json` nao existir, o servidor cria esse arquivo automaticamente a partir de `data/store.example.json`.

Depois abra:

- `http://localhost:3000/`
- `http://localhost:3000/admin.html`
- `http://localhost:3000/pedido.html`

## Configuracao da loja

Edite `data/store.json` com os dados reais da operacao. Os campos principais sao:

- `business.name`
- `business.whatsapp`
- `business.address`
- `business.hours`
- `business.deliveryFee`
- `business.minimumOrder`
- `owner.adminPin`
- `categories`

## Arquivos ignorados no Git

O repositorio agora ignora:

- `data/store.json`: configuracao local da loja
- `data/orders.json`: pedidos gerados em execucao

Assim, voce pode subir o projeto sem levar PIN real, numero de WhatsApp real ou historico de pedidos.

## Como funciona o WhatsApp

O sistema monta a mensagem do pedido e abre o WhatsApp com o texto pronto. No painel administrativo, quando o status muda, ele tambem prepara a mensagem para o cliente e exibe uma alternativa manual com abrir no WhatsApp Web e copiar texto.

Limitacao atual:

- o navegador nao consegue enviar a mensagem sozinho
- cliente e proprietaria ainda precisam confirmar o envio no WhatsApp

Para envio automatico de verdade, o proximo passo e integrar a API oficial do WhatsApp Business ou um provedor como Twilio.

## Antes de subir

Revise `data/store.example.json` e deixe esse arquivo com valores de exemplo, nao com os dados reais da loja.
