#!/usr/bin/env node
import React from 'react';
import { render } from 'ink';
import { BalatroApp } from '../../ui/BalatroApp.jsx';

const rawArgs = process.argv.slice(2);
let lang;

for (let i = 0; i < rawArgs.length; i++) {
  const a = rawArgs[i];
  if (a.startsWith('--lang=')) {
    lang = a.slice(7);
  } else if (a === '--lang' && rawArgs[i + 1]) {
    lang = rawArgs[++i];
  }
}

const options = (lang === 'zh' || lang === 'en') ? { lang } : {};
render(React.createElement(BalatroApp, { options }));
