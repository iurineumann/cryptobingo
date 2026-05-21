project(talk)

set(EOSIO_WASM_OLD_BEHAVIOR "Off")
find_package(cdt)

add_contract( bingo bingo bingo.cpp )
target_include_directories( bingo PUBLIC ${CMAKE_SOURCE_DIR}/../include )
target_ricardian_directory( bingo ${CMAKE_SOURCE_DIR}/../ricardian )