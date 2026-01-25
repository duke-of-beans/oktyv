/**
 * ParserEngine Tests
 * 
 * Tests for multi-format response parsing.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { ParserEngine, detectFormat, ResponseFormat } from '../../../src/tools/api/ParserEngine.js';

describe('ParserEngine', () => {
  const parser = new ParserEngine();
  
  describe('detectFormat()', () => {
    it('should detect JSON format', () => {
      assert.strictEqual(detectFormat('application/json'), ResponseFormat.JSON);
      assert.strictEqual(detectFormat('application/json; charset=utf-8'), ResponseFormat.JSON);
      assert.strictEqual(detectFormat('text/json'), ResponseFormat.JSON);
    });
    
    it('should detect XML format', () => {
      assert.strictEqual(detectFormat('application/xml'), ResponseFormat.XML);
      assert.strictEqual(detectFormat('text/xml'), ResponseFormat.XML);
    });
    
    it('should detect HTML format', () => {
      assert.strictEqual(detectFormat('text/html'), ResponseFormat.HTML);
      assert.strictEqual(detectFormat('text/html; charset=utf-8'), ResponseFormat.HTML);
    });
    
    it('should detect text format', () => {
      assert.strictEqual(detectFormat('text/plain'), ResponseFormat.TEXT);
    });
    
    it('should detect binary format', () => {
      assert.strictEqual(detectFormat('application/octet-stream'), ResponseFormat.BINARY);
      assert.strictEqual(detectFormat('image/png'), ResponseFormat.BINARY);
      assert.strictEqual(detectFormat('application/pdf'), ResponseFormat.BINARY);
    });
    
    it('should default to JSON for undefined', () => {
      assert.strictEqual(detectFormat(undefined), ResponseFormat.JSON);
    });
  });
  
  describe('parse() - JSON', () => {
    it('should parse JSON string', async () => {
      const data = '{"name":"test","value":123}';
      const result = await parser.parse(data, 'application/json');
      
      assert.strictEqual(result.success, true);
      assert.deepStrictEqual(result.data, { name: 'test', value: 123 });
      assert.strictEqual(result.format, ResponseFormat.JSON);
    });
    
    it('should parse JSON buffer', async () => {
      const data = Buffer.from('{"name":"test"}');
      const result = await parser.parse(data, 'application/json');
      
      assert.strictEqual(result.success, true);
      assert.deepStrictEqual(result.data, { name: 'test' });
    });
    
    it('should handle already parsed JSON', async () => {
      const data = { name: 'test' };
      const result = await parser.parse(data, 'application/json');
      
      assert.strictEqual(result.success, true);
      assert.deepStrictEqual(result.data, { name: 'test' });
    });
    
    it('should fail on invalid JSON', async () => {
      const data = '{invalid json}';
      const result = await parser.parse(data, 'application/json');
      
      assert.strictEqual(result.success, false);
      assert.strictEqual(result.error?.code, 'PARSE_ERROR');
    });
  });
  
  describe('parse() - XML', () => {
    it('should parse simple XML', async () => {
      const data = '<root><name>test</name><value>123</value></root>';
      const result = await parser.parse(data, 'application/xml');
      
      assert.strictEqual(result.success, true);
      assert.ok(result.data.root);
      assert.strictEqual(result.data.root.name, 'test');
      assert.strictEqual(result.data.root.value, '123');
    });
    
    it('should parse XML with attributes', async () => {
      const data = '<item id="1" type="test">value</item>';
      const result = await parser.parse(data, 'text/xml');
      
      assert.strictEqual(result.success, true);
      assert.ok(result.data.item);
    });
  });
  
  describe('parse() - HTML', () => {
    it('should parse HTML without selectors', async () => {
      const data = '<html><head><title>Test</title></head><body><p>Hello</p></body></html>';
      const result = await parser.parse(data, 'text/html');
      
      assert.strictEqual(result.success, true);
      assert.ok(result.data.html);
      assert.ok(result.data.text);
      assert.strictEqual(result.data.title, 'Test');
    });
    
    it('should parse HTML with selectors', async () => {
      const data = '<div class="title">Hello</div><div class="content">World</div>';
      const result = await parser.parse(data, 'text/html', {
        htmlSelectors: {
          title: '.title',
          content: '.content',
        },
      });
      
      assert.strictEqual(result.success, true);
      assert.strictEqual(result.data.title, 'Hello');
      assert.strictEqual(result.data.content, 'World');
    });
    
    it('should handle multiple elements with same selector', async () => {
      const data = '<li>Item 1</li><li>Item 2</li><li>Item 3</li>';
      const result = await parser.parse(data, 'text/html', {
        htmlSelectors: {
          items: 'li',
        },
      });
      
      assert.strictEqual(result.success, true);
      assert.ok(Array.isArray(result.data.items));
      assert.strictEqual(result.data.items.length, 3);
      assert.strictEqual(result.data.items[0], 'Item 1');
    });
  });
  
  describe('parse() - Text', () => {
    it('should parse plain text', async () => {
      const data = 'Hello, World!';
      const result = await parser.parse(data, 'text/plain');
      
      assert.strictEqual(result.success, true);
      assert.strictEqual(result.data, 'Hello, World!');
      assert.strictEqual(result.format, ResponseFormat.TEXT);
    });
    
    it('should convert buffer to text', async () => {
      const data = Buffer.from('Test string');
      const result = await parser.parse(data, 'text/plain');
      
      assert.strictEqual(result.success, true);
      assert.strictEqual(result.data, 'Test string');
    });
  });
  
  describe('parse() - Binary', () => {
    it('should handle binary data as buffer', async () => {
      const data = Buffer.from([0x89, 0x50, 0x4E, 0x47]);  // PNG header
      const result = await parser.parse(data, 'image/png');
      
      assert.strictEqual(result.success, true);
      assert.ok(Buffer.isBuffer(result.data));
      assert.strictEqual(result.format, ResponseFormat.BINARY);
    });
  });
});
