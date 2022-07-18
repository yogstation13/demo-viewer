import * as Comlink from "comlink";
import { DemoParserInterface } from "./interface";

Comlink.expose(new DemoParserInterface()); 
