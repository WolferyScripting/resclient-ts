<p align="center"><a href="https://resgate.io" target="_blank" rel="noopener noreferrer"><img width="100" src="https://raw.githubusercontent.com/resgateio/resclient/refs/heads/master/docs/img/resgate-logo.png" alt="Resgate logo"></a></p>


<h2 align="center"><b>ResClient for TypeScript</b><br/>Synchronize Your Clients</h2>
</p>

<p align="center">
<a href="http://opensource.org/licenses/MIT"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="License"></a>
<a href="https://www.npmjs.org/package/resclient-ts"><img src="http://img.shields.io/npm/v/resclient-ts.svg" alt="View on NPM"></a>
<a href="https://github.com/WolferyScripting/resclient-ts/actions/workflows/tests.yml"><img src="https://github.com/WolferyScripting/resclient-ts/actions/workflows/tests.yml/badge.svg" alt="Build Status"></a>
<a href="https://coveralls.io/github/WolferyScripting/resclient-ts?branch=master"><img src="https://coveralls.io/repos/github/WolferyScripting/resclient-ts/badge.svg?branch=master" alt="Coverage"></a>
</p>

---

Javascript client library implementing the RES-Client Protocol. Used to establish WebSocket connections to [Resgate](https://resgate.io), to get your data synchronized in real-time.

Visit [Resgate.io](https://resgate.io) for more information.

## Installation

```sh
npm install resclient-ts
```


## Basic Usage

```javascript
import WebSocket from "ws";
import { ResClient } from "resclient-ts";
const wsFactory = () => new WebSocket("ws://localhost:8080");
// Create instance with a WebSocket factory function
const client = new ResClient(wsFactory);
```

This module is built for first party ESModules.

## Example usage

```javascript
import WebSocket from "ws";
import { ResClient } from "resclient-ts";
const wsFactory = () => new WebSocket("ws://localhost:8080");
const client = new ResClient(wsFactory);

client.get("example.mymodel").then(model => {
    console.log(model.message);

    const onChange = () => {
        console.log("New message: " + model.message);
    };

    // Listen to changes for 5 seconds, eventually unsubscribing
    model.resourceOn("change", onChange);
    setTimeout(() => {
        model.resourceOff("change", onChange);
    }, 5000);
});
```
