# Серверный контур (vps-ru-1)

Runbook для восстановления/понимания прод-окружения `sbory.mirobase.ru`. Обычный деплой — просто `bash scripts/deploy.sh` из корня репо; всё ниже — ручная разовая настройка и её карта.

## Что где живёт

| Компонент | Расположение | Доставка |
|-----------|--------------|----------|
| Стек приложения | `/opt/sbory/` (docker-compose.yml, schema.sql, .env) | `scripts/deploy.sh` (compose+schema), образ через `docker save \| ssh docker load` |
| Секрет БД | `/opt/sbory/.env` → `POSTGRES_PASSWORD=<hex>` (chmod 600) | вручную: `echo "POSTGRES_PASSWORD=$(openssl rand -hex 24)" > /opt/sbory/.env` |
| Nginx vhost | `/etc/nginx/sites-available/sbory` (+симлинк в sites-enabled) | вручную: `scp deploy/nginx-sbory.conf vps-ru-1:/etc/nginx/sites-available/sbory` |
| SNI-роутер | `/etc/nginx/stream.d/sni.conf` | только на сервере, см. ниже |
| Сертификат | `/etc/letsencrypt/live/sbory.mirobase.ru/` | `certbot --nginx -d sbory.mirobase.ru` + ручной перенос listen на 8080 (см. ниже) |

## ВАЖНО: порт 443 занят SNI-роутером

На сервере nginx слушает 443 **stream-модулем** с `ssl_preread`: известные домены уходят на `127.0.0.1:8080` (обычные http-vhost'ы с TLS), все неизвестные SNI — в Xray VPN (remnanode, `127.0.0.1:8443`). Поэтому:

- vhost'ы сайтов слушают **8080 ssl**, не 443 (`deploy/nginx-sbory.conf` уже такой);
- `listen 443` в любом vhost'е уронит reload nginx (`bind(): Address already in use`);
- новый домен на этом сервере = vhost на 8080 **плюс** строка в map `/etc/nginx/stream.d/sni.conf`:

```nginx
# внутри map $ssl_preread_server_name $backend { ... }
sbory.mirobase.ru       web_backend;
```

Актуальное содержимое `sni.conf` (2026-07-03): map с mirobase.ru / www / annamaks / sbory → `web_backend` (127.0.0.1:8080), `default` → `remnawave_backend` (127.0.0.1:8443), server-блок `listen 443; ssl_preread on;`.

## Выпуск/обновление сертификата

`certbot --nginx -d sbory.mirobase.ru` вписывает `listen 443 ssl` — после него нужно руками заменить listen-директивы на `listen 8080 ssl http2;` / `listen [::]:8080 ssl http2;` (или просто перезалить `deploy/nginx-sbory.conf` поверх, сохранив пути сертификата) и `nginx -t && systemctl reload nginx`. Продление (`certbot renew`) конфиг не трогает — проблема только при первом выпуске.

## Импорт данных с локальной машины

Postgres наружу не торчит, только `127.0.0.1:54329` на сервере. Туннель + импорт:

```bash
ssh -N -L 15432:127.0.0.1:54329 vps-ru-1 &            # 54330-54429 на Windows заняты Hyper-V
PGPASS=$(ssh vps-ru-1 "grep POSTGRES_PASSWORD /opt/sbory/.env | cut -d= -f2")
DATABASE_URL="postgresql://sbory:${PGPASS}@localhost:15432/sbory" node scripts/import-db.mjs
```

Импорт идемпотентен (TRUNCATE CASCADE), счётчики печатает сам — сверить с выводом `scripts/export-supabase.mjs`.

## Диагностика

```bash
ssh vps-ru-1 'cd /opt/sbory && docker compose ps && docker compose logs app --tail 30'
ssh vps-ru-1 'curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:3002/'
ssh vps-ru-1 'tail -20 /var/log/nginx/error.log'
```
