# DVA_Pass

Cofre de senhas para Android e computador, compatível com KeePass (arquivos `.kdbx`, KDBX 3.1 e 4).
Abre e grava direto no mesmo arquivo usado pelo KeePass2 e pelo Keepass2Android, por exemplo no Google Drive.

- **Android (APK):** abre o `.kdbx` pelo Google Drive, desbloqueia com a digital, grava no próprio arquivo. O app não tem permissão de internet.
- **Computador:** o arquivo `DVA_Pass-vX.html` abre no Chrome ou no Edge e grava direto no `.kdbx` da pasta do Google Drive (G:).
- Mesmo visual nos dois; ao salvar, mescla as alterações feitas em outro aparelho.

Criado por Daniel Vale Abrão — dvabrao@gmail.com

O APK e o HTML são gerados automaticamente em **Actions** e publicados em **Releases** a cada envio para `main`.

## Estrutura
- `web/src` — interface (HTML/CSS/JS). `cd web && npm ci && node build.mjs` gera `app/src/main/assets/index.html`.
- `app/` — app Android (WebView + ponte Java: Drive/SAF, digital com Android Keystore, área de transferência).
- A versão fica em `app/build.gradle` (`versionName`) e aparece na tela Sobre.
