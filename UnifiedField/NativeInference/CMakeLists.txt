cmake_minimum_required(VERSION 3.16)
project(HeavenzFireNativeInference VERSION 0.1.0 LANGUAGES CXX)

add_executable(hf-nie src/main.cpp)
target_compile_features(hf-nie PRIVATE cxx_std_17)
target_compile_options(hf-nie PRIVATE -Wall -Wextra -Wpedantic -Wconversion -Wshadow)

enable_testing()
add_test(NAME hf-nie-self-test COMMAND hf-nie --self-test)
