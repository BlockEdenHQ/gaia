# BlockEden.xyz dStore's fork of Gaia

The project goal is to add ethstorage driver to gaia.

https://github.com/ethstorage/ethfs-uploader


## Work with local disk

Add config.json to ./hub/

```json
{
  "port": 3876,
  "driver": "disk",
  "readURL": "https://this-won-t-work-with-local-disk-driver",

  "diskSettings": {
    "storageRootDirectory":"/Users/TODO/projects/gaia/data"
  },

  "argsTransport": {
    "level": "debug",
    "handleExceptions": true,
    "timestamp": true,
    "colorize": true,
    "json": false
  }
}
```

and then run the hub

```bash
CONFIG_PATH=/Users/TODO/projects/gaia/hub/config.json yarn start
```

Finally, run the test

```bash
node ./deploy/gaia_test.js http://localhost:3876
```


-------------------------------------------------------

Gaia: A decentralized high-performance storage system
====================================

[![codecov](https://codecov.io/gh/stacks-network/gaia/branch/master/graph/badge.svg)](https://app.codecov.io/gh/stacks-network/gaia)

This document describes the high-level design and implementation of the
Gaia storage system, also briefly explained in the [docs.stacks.co](https://docs.stacks.co/build-apps/references/gaia). It includes specifications for backend storage drivers and interactions between developer APIs and the Gaia service.

Developers who wish to use the Gaia storage system should see the `stacks.js` documentation [here](https://stacks.js.org/) and in particular the storage package [here](https://github.com/hirosystems/stacks.js/tree/master/packages/storage).

Instructions on setting up, configuring and testing a Gaia Hub can be found [here](https://github.com/stacks-network/gaia/blob/master/deploy/README.md) and [here](https://forum.stacks.org/t/tech-preview-using-your-own-gaia-hub-with-the-cli/6160).

# Overview

Gaia works by hosting data in one or more existing storage systems of the user's choice.
These storage systems are typically cloud storage systems.  We currently have driver support
for S3 and Azure Blob Storage, but the driver model allows for other backend support
as well. The point is, the user gets to choose where their data lives, and Gaia enables
applications to access it via a uniform API.

Blockstack applications use the Gaia storage system to store data on behalf of a user.
When the user logs in to an application, the authentication process gives the application
the URL of a Gaia hub, which performs writes on behalf of that user. The Gaia hub authenticates
writes to a location by requiring a valid authentication token, generated by a private key
authorized to write at that location.

# User Control: How is Gaia Decentralized?

Gaia's approach to decentralization focuses on user-control of data and storage. If a user
can choose which gaia hub and which backend provider to store data with, then that is all
the decentralization required to enable user-controlled applications.

In Gaia, the control of user data lies in the way that user data is accessed. When an application
fetches a file `data.txt` for a given user `alice.id`, the lookup will follow these steps:

1. Fetch the zonefile for `alice.id`, and read her profile URL from that zonefile
2. Fetch the Alice's profile and _verify_ that it is signed by `alice.id`'s key
3. Read the application root URL (e.g. `https://gaia.alice.org/`) out of the profile
4. Fetch file from `https://gaia.alice.org/data.txt`

Because `alice.id` controls her zonefile, she can change where her profile is stored,
if the current storage of the profile is compromised. Similarly, if Alice wishes to change
her gaia provider, or run her own gaia node, she can change the entry in her profile.

For applications writing directly on behalf of Alice, they do not need to perform this
lookup. Instead, the stack.js [authentication flow](https://github.com/hirosystems/stacks.js/blob/master/packages/auth/README.md#handling-an-authentication-response-payload) provides Alice's chosen application root
URL to the application. This authentication flow _is also_ within Alice's control, because the
authentication response _must_ be generated by Alice's browser.

While it is true that many Gaia hubs will use backend providers like AWS or Azure, allowing
users to easily operate their own hubs, which may select different backend providers (and we'd
like to implement more backend drivers), enables truly user-controlled data, while enabling
high performance and high availability for data reads and writes.

# Write-to and Read-from URL Guarantees

A performance and simplicity oriented guarantee of the Gaia
specification is that when an application submits a _write_ to a URL
`https://myhub.service.org/store/foo/bar`, the application is guaranteed to
be able to read from a URL `https://myreads.com/foo/bar`. While the
_prefix_ of the read-from URL may change between the two, the suffix
must be the same as the write-to URL.

This allows an application to know _exactly_ where a written file can
be read from, given the read prefix. To obtain that read prefix,
the Gaia service defines an endpoint:

```
GET /hub_info/
```

which returns a JSON object with a `read_url_prefix`.


For example, if my service returns:

```javascript
{ ...,
  "read_url_prefix": "https://myservice.org/read/"
}
```

I know that if I submit a write request to:

```
https://myservice.org/store/1DHvWDj834zPAkwMhpXdYbCYh4PomwQfzz/0/profile.json
```

That I will be able to read that file from:

```
https://myservice.org/read/1DHvWDj834zPAkwMhpXdYbCYh4PomwQfzz/0/profile.json
```


# Address-based Access-Control

Access control in a gaia storage hub is performed on a per-address
basis.  Writes to URLs `/store/<address>/<file>` are only allowed if
the writer can demonstrate that they control _that_ address. This is
achieved via an authentication token, which is a message _signed_ by
the private-key associated with that address. The message itself is a
challenge-text, returned via the `/hub_info/` endpoint.

## V1 Authentication Scheme

The V1 authentication scheme uses a JWT, prefixed with `v1:` as a
bearer token in the HTTP authorization field. The expected JWT payload
structure is:

```
{
 'type': 'object',
 'properties': {
   'iss': { 'type': 'string' },
   'exp': { 'type': 'IntDate' },
   'iat': { 'type': 'IntDate' },
   'gaiaChallenge': { 'type': 'string' },
   'associationToken': { 'type': 'string' },
   'salt': { 'type': 'string' }
 }
 'required': [ 'iss', 'gaiaChallenge' ]
}
```

In addition to `iss`, `exp`, and `gaiaChallenge` claims, clients may
add other properties (e.g., a `salt` field) to the payload, and they will
not affect the validity of the JWT. Rather, the validity of the JWT is checked
by ensuring:

1. That the JWT is signed correctly by verifying with the pubkey hex provided as
`iss`
2. That `iss` matches the address associated with the bucket.
3. That `gaiaChallenge` is equal to the server's challenge text.
4. That the epoch time `exp` is greater than the server's current epoch time.
5. That the epoch time `iat` (issued-at date) is greater than the bucket's revocation date (only if such a date has been set by the bucket owner).

### Association Tokens

The association token specification is considered private, as it is mostly used
for internal Gaia use cases. This means that this specification can change or
become deprecated in the future.

Often times, a single user will use many different keys to
store data.  These keys may be generated on-the-fly.  Instead of requiring the
user to explicitly whitelist each key, the v1 authentication scheme allows
the user to bind a key to an already-whitelisted key via an *association token*.

An association token is a JWT signed by a whitelisted key that, in turn,
contains the public key that signs the authentication JWT that contains it.  Put
another way, the Gaia hub will accept a v1 authentication JWT if it contains an
`associationToken` JWT that (1) was sigend by a whitelisted address, and (2)
identifies the signer of the authentication JWT.

The association token JWT has the following structure in its payload:

```
{
  'type': 'object',
  'properties': {
    'iss': { 'type': 'string' },
    'exp': { 'type': 'IntDate' },
    'iat': { 'type': 'IntDate' },
    'childToAssociate': { 'type': 'string' },
    'salt': { 'type': 'string' },
  },
  'required': [ 'iss', 'exp', 'childToAssociate' ]
}
```

Here, the `iss` field should be the public key of a whitelisted address.
The `childtoAssociate` should be equal to the `iss` field of the authentication
JWT.  Note that the `exp` field is *required* in association tokens.

## Legacy authentication scheme

In more detail, this signed message is:

```
BASE64({ "signature" : ECDSA_SIGN(SHA256(challenge-text)),
         "publickey" : PUBLICKEY_HEX })
```

Currently, challenge-text must match the _known_ challenge-text on
the gaia storage hub. However, as future work enables more extensible
forms of authentication, we could extend this to allow the auth
token to include the challenge-text as well, which the gaia storage hub
would then need to also validate.


# Data storage format

A gaia storage hub will store the written data _exactly_ as
given. This means that the storage hub _does not_ provide many
different kinds of guarantees about the data. It does not ensure that
data is validly formatted, contains valid signatures, or is
encrypted. Rather, the design philosophy is that these concerns are
client-side concerns. Client libraries (such as `stacks.js`) are
capable of providing these guarantees, and we use a liberal definition of
the end-to-end principle to guide this design decision.

# Operation of a Gaia Hub

## Configuration files

A configuration TOML/JSON file should be stored either in the top-level directory
of the hub server, or a file location may be specified in the environment
variable `CONFIG_PATH`.

An example configuration file is provided in (./hub/config.sample.json)
You can specify the logging level, the number of social proofs required
for addresses to write to the system, the backend driver, the credentials
for that backend driver, and the readURL for the storage provider.

### Private hubs

A private hub services requests for a single user. This is controlled
via _whitelisting_ the addresses allowed to write files. In order to
support application storage, because each application uses a different
app- and user-specific address, each application you wish to use must
be added to the whitelist separately.

Alternatively, the user's client must use the v1 authentication scheme and generate
an association token for each app.  The user should whitelist her address, and
use her associated private key to sign each app's association token.  This
removes the need to whitelist each application, but with the caveat that the
user needs to take care that her association tokens do not get misused.

### Open-membership hubs

An open-membership hub will allow writes for _any_ address top-level directory,
each request will still be validated such that write requests must provide valid
authentication tokens for that address. Operating in this mode is recommended
for service and identity providers who wish to support many different users.

In order to limit the users that may interact with such a hub to users
who provide social proofs of identity, we support an execution mode
where the hub checks that a user's profile.json object contains
_social proofs_ in order to be able to write to other locations. This
can be configured via the `config.json` or `config.toml`.

# Driver model

Gaia hub drivers are fairly simple. The biggest requirement is the ability
to fulfill the _write-to/read-from_ URL guarantee. 

A driver can expect that two modification operations to the same path will be mutually exclusive. 
No writes, renames, or deletes to the same path will be concurrent.

As currently implemented
a gaia hub driver must implement the following functions:


```ts
interface DriverModel {

  /**
   * Return the prefix for reading files from.
   *  a write to the path `foo` should be readable from
   *  `${getReadURLPrefix()}foo`
   * @returns the read url prefix.
   */
  getReadURLPrefix(): string;

  /**
   * Performs the actual write of a file to `path`
   *   the file must be readable at `${getReadURLPrefix()}/${storageToplevel}/${path}`
   *
   * @param options.path - path of the file.
   * @param options.storageToplevel - the top level directory to store the file in
   * @param options.contentType - the HTTP content-type of the file
   * @param options.stream - the data to be stored at `path`
   * @param options.contentLength - the bytes of content in the stream
   * @param options.ifMatch - optional etag value to be used for optimistic concurrency control
   * @param options.ifNoneMatch - used with the `*` value to save a file not known to exist,
   * guaranteeing that another upload didn't happen before, losing the data of the previous
   * @returns Promise that resolves to an object containing a public-readable URL of the stored content and the objects etag value
   */
  performWrite(options: {
    path: string;
    storageTopLevel: string;
    stream: Readable;
    contentLength: number;
    contentType: string;
    ifMatch?: string;
    ifNoneMatch?: string;
  }): Promise<{
    publicURL: string,
    etag: string
  }>;

  /**
   * Deletes a file. Throws a `DoesNotExist` if the file does not exist. 
   * @param options.path - path of the file
   * @param options.storageTopLevel - the top level directory
   * @param  options.contentType - the HTTP content-type of the file
   */
  performDelete(options: {
    path: string;
    storageTopLevel: string;
  }): Promise<void>;

  /**
   * Renames a file given a path. Some implementations do not support
   * a first class move operation and this can be implemented as a copy and delete. 
   * @param options.path - path of the original file
   * @param options.storageTopLevel - the top level directory for the original file
   * @param options.newPath - new path for the file
   */
  performRename(options: {
    path: string;
    storageTopLevel: string;
    newPath: string;
  }): Promise<void>;

  /**
   * Retrieves metadata for a given file.
   * @param options.path - path of the file
   * @param options.storageTopLevel - the top level directory
   */
  performStat(options: {
    path: string;
    storageTopLevel: string;
  }): Promise<{
    exists: boolean;
    lastModifiedDate: number;
    contentLength: number;
    contentType: string;
    etag: string;
  }>;

  /**
   * Returns an object with a NodeJS stream.Readable for the file content
   * and metadata about the file.
   * @param options.path - path of the file
   * @param options.storageTopLevel - the top level directory
   */
  performRead(options: {
    path: string;
    storageTopLevel: string;
  }): Promise<{
    data: Readable;
    lastModifiedDate: number;
    contentLength: number;
    contentType: string;
    etag: string;
  }>;

  /**
   * Return a list of files beginning with the given prefix,
   * as well as a driver-specific page identifier for requesting
   * the next page of entries.  The return structure should
   * take the form { "entries": [string], "page"?: string }
   * @returns {Promise} the list of files and a possible page identifier.
   */
  listFiles(options: {
    pathPrefix: string;
    page?: string;
  }): Promise<{
    entries: string[];
    page?: string;
  }>;

  /**
   * Return a list of files beginning with the given prefix,
   * as well as file metadata, and a driver-specific page identifier
   * for requesting the next page of entries.
   */
  listFilesStat(options: {
    pathPrefix: string;
    page?: string;
  }): Promise<{
    entries: {
        name: string;
        lastModifiedDate: number;
        contentLength: number;
        etag: string;
    }[];
    page?: string;
  }>;
  
}
```

# HTTP API

The Gaia storage API defines the following endpoints:

---

##### `GET ${read-url-prefix}/${address}/${path}`

This returns the data stored by the gaia hub at `${path}`.
The response headers include `Content-Type` and `ETag`, along with
the required CORS headers `Access-Control-Allow-Origin` and `Access-Control-Allow-Methods`.

---

##### `HEAD ${read-url-prefix}/${address}/${path}`

Returns the same headers as the corresponding `GET` request. `HEAD` requests
do not return a response body. 

---

##### `POST ${hubUrl}/store/${address}/${path}`

This performs a write to the gaia hub at `${path}`. 

On success, it returns a `202` status, and a JSON object:

```javascript
{
 "publicURL": "${read-url-prefix}/${address}/${path}",
 "etag": "version-identifier"
}
```

The `POST` must contain an authentication header with a bearer token.
The bearer token's content and generation is described in
the [access control](#address-based-access-control) section of this
document.

Additionally, file ETags and conditional request headers are used as a 
concurrency control mechanism. All requests to this endpoint should contain
either an `If-Match` header or an `If-None-Match` header. The three request
types are as follows:

__Update existing file__: this request must specify an `If-Match` header 
containing the most up to date ETag. If the file has been updated elsewhere 
and the ETag supplied in the `If-Match` header doesn't match that of the file 
in gaia, a `412 Precondition Failed` error will be returned.

__Create a new file__: this request must specify the `If-None-Match: *` 
header. If the already exists at the given path, a `412 Precondition Failed` 
error will be returned.

__Overwrite a file__: this request must specify the `If-Match: *` header. 
__Note__ that this bypasses concurrency control and should be used with 
caution. Improper use can cause bugs such as unintended data loss. 


The file ETag is returned in the response body of the _store_ `POST` request, the 
response headers of `GET` and `HEAD` requests, and in the returned entries in 
`list-files` request. 


Additionally, a request to a file path that already has a previous ongoing 
request still processing for the same file path will return with a 
`409 Conflict` error. This can be handled with a retry. 

---

##### `DELETE ${hubUrl}/delete/${address}/${path}`

This performs a deletion of a file in the gaia hub at `${path}`. 

On success, it returns a `202` status. Returns a `404` if the path does 
not exist. Returns `400` if the path is invalid. 

The `DELETE` must contain an authentication header with a bearer token.
The bearer token's content and generation is described in
the [access control](#address-based-access-control) section of this
document.

---

##### `GET ${hubUrl}/hub_info/`

Returns a JSON object:

```javascript
{
 "challenge_text": "text-which-must-be-signed-to-validate-requests",
 "read_url_prefix": "${read-url-prefix}"
 "latest_auth_version": "v1"
}
```

The latest auth version allows the client to figure out which auth versions the
gaia hub supports.

---

##### `POST ${hubUrl}/revoke-all/${address}`

The post body must be a JSON object with the following field:
```json
{ "oldestValidTimestamp": "${timestamp}" }
```
Where the `timestamp` is an epoch time in seconds. The timestamp is written
to a bucket-specific file (`/${address}-auth`). This becomes the oldest valid 
`iat` timestamp for authentication tokens that write to the `/${address}/` bucket.

On success, it returns a `202` status, and a JSON object:

```json
{ "status": "success" }
```

The `POST` must contain an authentication header with a bearer token.
The bearer token's content and generation is described in
the [access control](#address-based-access-control) section of this
document.

---

##### `POST ${hubUrl}/list-files/${address}`

The post body can contain a `page` field with the pagination identifier from a previous request:
```json
{ "page": "${lastListFilesResult.page}" }
```
If the post body contains a `stat: true` field then the returned JSON includes file metadata:
```jsonc
{
  "entries": [
    { "name": "string", "lastModifiedDate": "number", "contentLength": "number", "etag": "string" },
    { "name": "string", "lastModifiedDate": "number", "contentLength": "number", "etag": "string" },
    // ...
  ],
  "page": "string" // possible pagination marker
}
```

If the post body does not contain a `stat: true` field then the returned JSON entries will only be
file name strings:
```jsonc
{
  "entries": [
    "fileNameExample1",
    "fileNameExample2",
    // ...
  ],
  "page": "string" // possible pagination marker
}
```

The `POST` must contain an authentication header with a bearer token.
The bearer token's content and generation is described in
the [access control](#address-based-access-control) section of this
document.

-----

# Future Design Goals

## Dependency on DNS

The gaia specification requires that a gaia hub return a URL that a user's client
will be able to fetch. In practice, most gaia hubs will use URLs with DNS entries
for hostnames (though URLs with IP addresses would work as well). However, even
though the spec uses URLs, that doesn't necessarily make an opinionated claim on
underlying mechanisms for that URL. If a browser supported new URL schemes which
enabled lookups without traditional DNS (for example, with the Blockstack Name
System instead), then gaia hubs could return URLs implementing that scheme. As
the Blockstack ecosystem develops and supports these kinds of features, we expect
users would deploy gaia hubs that would take advantage.

## Extensibly limiting membership sets

Some service providers may wish to provide hub services to a limited set of
different users, with a provider-specific method of authenticating that a user
or address is within that set. In order to provide that functionality, our hub
implementation would need to be extensible enough to allow plugging in different
authentication models.

## A `.storage` Namespace

<!--- Blockstack Core no longer does this, but Gaia nodes do.  I updated this
section to reflect that (jcn) -->

Gaia nodes can request data from other Gaia nodes, and can store data
to other Gaia nodes.  In effect, Gaia nodes can be "chained together"
in arbitrarily complex ways.  This creates an opportunity to create
a decentralized storage marketplace.

### Example

For example, Alice can make her Gaia node public and program it to
store data to her Amazon S3 bucket and her Dropbox account.  Bob can then POST data to Alice's 
node, causing her node to replicate data to both providers.  Later, Charlie can
read Bob's data from Alice's node, causing Alice's node to fetch and serve back
the data from her cloud storage.  Neither Bob nor Charlie have to set up accounts on
Amazon S3 and Dropbox this way, since Alice's node serves as an intermediary
between them and the storage providers.

Since Alice is on the read/write path between Bob and Charlie and cloud storage,
she has the opportunity to make optimizations.  First, she can program her
Gaia node to synchronously write data to
local disk and asynchronously back it up to S3 and Dropbox.  This would speed up
Bob's writes, but at the cost of durability (i.e. Alice's node could crash
before replicating to the cloud).

In addition, Alice can program her Gaia node to service all reads from disk.  This
would speed up Charlie's reads, since he'll get the latest data without having
to hit back-end cloud storage providers.

### Service Description

Since Alice is providing a service to Bob and Charlie, she will want
compensation.  This can be achieved by having both of them send her money via
the underlying blockchain.

To do so, she would register her node's IP address in a
`.storage` namespace in Blockstack, and post her rates per gigabyte in her node's
profile and her payment address.  Once Bob and Charlie sent her payment, her
node would begin accepting reads and writes from them up to the capacity
purchased.  They would continue sending payments as long as Alice provides them
with service.

Other experienced Gaia node operators would register their nodes in `.storage`, and
compete for users by offerring better durability, availability, performance,
extra storage features, and so on.

# Notes on our deployed service

Our deployed service places some modest limitations on file uploads and rate limits.
Currently, the service will only allow up to 20 write requests per second and a maximum
file size of 5MB. However, these limitations are only for our service, if you deploy
your own Gaia hub, these limitations are not necessary.

# Project Comparison

Here's how Gaia stacks up against other decentralized storage systems.  Features
that are common to all storage systems are omitted for brevity.

| **Features**                | Gaia | [Sia](https://sia.tech/) | [Storj](https://storj.io/) | [IPFS](https://ipfs.io) | [DAT](https://datproject.org) | [SSB](https://www.scuttlebutt.nz/) |
|-----------------------------|------|--------------------------|----------------------------|-------------------------|-------------------------------|------------------------------------|
| User controls where data is hosted           | X |   |   |   |   |   |
| Data can be viewed in a normal Web browser   | X |   |   | X |   |   |
| Data is read/write                           | X |   |   |   | X | X |
| Data can be deleted                          | X |   |   |   | X | X |
| Data can be listed                           | X | X | X |   | X | X |
| Deleted data space is reclaimed              | X | X | X | X |   |   | 
| Data lookups have predictable performance    | X |   | X |   |   |   |
| Writes permission can be delegated           | X |   |   |   |   |   |
| Listing permission can be delegated          | X |   |   |   |   |   |
| Supports multiple backends natively          | X |   | X |   |   |   |
| Data is globally addressable                 | X | X | X | X | X |   | 
| Needs a cryptocurrency to work               |   | X | X |   |   |   |
| Data is content-addressed                    |   | X | X | X | X | X |
