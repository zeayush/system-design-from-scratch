// Wasm bridge for the Machine Room frontend.
//
// This module exists ONLY to expose the chapter libraries to JavaScript. It is
// deliberately a separate module living under frontend/ so that nothing has to
// be added to the chapter repos themselves — they are consumed as dependencies
// via the replace directives below and are never modified.
//
// uid-generator-go declares `module uid-generator-go` (not a URL), so a replace
// directive is the only way to import it. The other two are replaced as well so
// the build always uses the checked-out submodule rather than a published tag.
module machineroom/wasm

go 1.22

require (
	github.com/zeayush/consistent-hashing-go v0.0.0
	github.com/zeayush/rate-limiter-go v0.0.0
	uid-generator-go v0.0.0
)

replace github.com/zeayush/rate-limiter-go => ../../1.4-Rate-Limiter/rate-limiter-go

replace github.com/zeayush/consistent-hashing-go => ../../1.5-Consistent-Hashing/consistent-hashing-go

replace uid-generator-go => ../../1.7-Unique-ID-Generator/uid-generator-go
