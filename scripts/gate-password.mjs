/* Смена пароля на вход в прототип: спрашивает пароль, считает SHA-256
   и подставляет его в src/gate.ts. Сам пароль никуда не сохраняется —
   ни в файл, ни в историю команд.

   Ввод скрыт: вместо символов печатаются точки. Запасные пути, если
   скрытый ввод не набирается:
     npm run gate -- --show     пароль виден на экране
     echo 'пароль' | npm run gate   без терминала вообще

   Клавиши сравниваем по кодам, а не по escape-последовательностям:
   так строка не портится при правках файла. */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline';

const FILE = new URL('../src/gate.ts', import.meta.url);
const { stdin, stdout } = process;
const SHOW = process.argv.includes('--show');

const CR = 13, LF = 10, EOT = 4, ETX = 3, DEL = 127, BS = 8, SPACE = 32;

/* Обычная строка readline: символы видно, зато работает везде */
const askPlain = (prompt) => new Promise((resolve) => {
  const rl = createInterface({ input: stdin, output: stdout });
  /* close без ответа — это Ctrl+D: выходим, а не висим молча */
  rl.on('close', () => resolve(''));
  rl.question(prompt, (a) => { rl.close(); resolve(a) });
});

/* Пароль из стандартного ввода: пайп, редактор, CI */
const askPiped = () => new Promise((resolve) => {
  let data = '';
  stdin.setEncoding('utf8');
  stdin.on('data', (c) => { data += c });
  stdin.on('end', () => resolve(data.split('\n')[0]));
});

function ask(prompt) {
  if (!stdin.isTTY) return askPiped();
  if (SHOW) return askPlain(prompt);
  /* Посимвольный режим есть не в каждом терминале — если его нет,
     спрашиваем обычной строкой, а не падаем */
  try { stdin.setRawMode(true) } catch { return askPlain(prompt) }

  return new Promise((resolve) => {
    stdout.write(prompt);
    stdin.resume();
    stdin.setEncoding('utf8');
    let buf = '';
    const done = (value, code) => {
      stdin.setRawMode(false);
      stdin.removeListener('data', onData);
      stdin.pause();
      stdout.write('\n');
      if (code !== undefined) process.exit(code);
      resolve(value);
    };
    const onData = (chunk) => {
      /* Вставка из буфера приходит одним куском — разбираем посимвольно */
      for (const ch of chunk) {
        const c = ch.codePointAt(0);
        if (c === CR || c === LF || c === EOT) return done(buf);
        if (c === ETX) return done('', 130);
        if (c === DEL || c === BS) {
          if (buf.length) { buf = buf.slice(0, -1); stdout.write('\b \b') }
          continue;
        }
        if (c >= SPACE) { buf += ch; stdout.write('•') }
      }
    };
    stdin.on('data', onData);
  });
}

const pass = (await ask('Новый пароль: ')).trim();
if (pass.length < 6) {
  console.error('Слишком короткий пароль: нужно хотя бы шесть символов.');
  process.exit(1);
}

const RE = /export const GATE_HASH = '[0-9a-f]*'/;
const hash = createHash('sha256').update(pass).digest('hex');
const src = readFileSync(FILE, 'utf8');
if (!RE.test(src)) {
  console.error('Не нашёл строку GATE_HASH в src/gate.ts — правьте её руками.');
  process.exit(1);
}
const next = src.replace(RE, `export const GATE_HASH = '${hash}'`);
if (next === src) {
  console.log('Это тот же пароль, что уже стоит — файл не менялся.');
  process.exit(0);
}
writeFileSync(FILE, next);
console.log('Пароль обновлён в src/gate.ts.');
console.log('Дальше: git commit -am "Новый пароль" && git push — сборка уедет сама.');
console.log('Все, кто уже входил, спросятся заново.');
